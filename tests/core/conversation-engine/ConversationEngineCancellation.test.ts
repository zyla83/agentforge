import {
  ConversationEngine,
  ConversationEngineError,
  ConversationTurnAbortedError,
  ConversationTurnExecutionPhase,
  createConversation,
  createConversationEngine,
} from "@agentforge/core";
import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderAbortError,
  ProviderHealthStatus,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(content = "Answer"): LLMGenerationResponse {
  return {
    model: "model",
    message: { role: LLMMessageRole.Assistant, content },
    finishReason: LLMFinishReason.Stop,
  };
}

class ControlledProvider implements LLMProvider {
  readonly metadata = { name: "controlled", version: "1.0.0" };
  readonly started = deferred<void>();
  readonly result = deferred<LLMGenerationResponse>();
  readonly requests: LLMGenerationRequest[] = [];
  failure: unknown;

  async checkHealth() {
    return { status: ProviderHealthStatus.Healthy } as const;
  }

  async generate(request: LLMGenerationRequest) {
    this.requests.push(request);
    this.started.resolve();
    if (this.failure !== undefined) throw this.failure;
    return this.result.promise;
  }
}

function resolver(provider: LLMProvider) {
  return {
    getLLMProvider: () => undefined,
    getDefaultLLMProvider: () => provider,
  };
}

const turn = {
  conversation: createConversation({
    id: "source",
    createdAt: "2020-01-01T00:00:00.000Z",
  }),
  content: "Question",
  model: "model",
};

describe("ConversationEngine complete-turn cancellation", () => {
  it.each(["engine", "turn"] as const)(
    "rejects an already-aborted %s signal before validation and side effects",
    async (source) => {
      const controller = new AbortController();
      const reason = new Error(`${source} cancelled`);
      controller.abort(reason);
      const provider = new ControlledProvider();
      let ids = 0;
      let dates = 0;
      const engine = createConversationEngine({
        providers: resolver(provider),
        ...(source === "engine" ? { signal: controller.signal } : {}),
        conversationFactory: {
          idGenerator: () => `id-${++ids}`,
          now: () => {
            dates += 1;
            return new Date("2020-01-01T00:00:01.000Z");
          },
        },
      });
      const input =
        source === "turn"
          ? ({ request: { signal: controller.signal } } as never)
          : (null as never);

      await expect(engine.runTurn(input)).rejects.toMatchObject({
        phase: ConversationTurnExecutionPhase.Validation,
        reason,
        cause: reason,
      });
      expect(ids).toBe(0);
      expect(dates).toBe(0);
      expect(provider.requests).toHaveLength(0);
    },
  );

  it("cancels after user append before the provider call", async () => {
    const controller = new AbortController();
    const provider = new ControlledProvider();
    let ids = 0;
    let dates = 0;
    const engine = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
      conversationFactory: {
        idGenerator: () => `id-${++ids}`,
        now: () => {
          dates += 1;
          controller.abort("after user append");
          return new Date("2020-01-01T00:00:01.000Z");
        },
      },
    });

    await expect(engine.runTurn(turn)).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.UserAppend,
      reason: "after user append",
    });
    expect(provider.requests).toHaveLength(0);
    expect(ids).toBe(1);
    expect(dates).toBe(1);
    expect(turn.conversation.messages).toHaveLength(0);
  });

  it("composes both signals, forwards timeout, and rejects when an ignoring provider resolves", async () => {
    const engineController = new AbortController();
    const turnController = new AbortController();
    const provider = new ControlledProvider();
    let ids = 0;
    let dates = 0;
    const request = { signal: turnController.signal, timeoutMs: 4_000 };
    const promise = createConversationEngine({
      providers: resolver(provider),
      signal: engineController.signal,
      conversationFactory: {
        idGenerator: () => `id-${++ids}`,
        now: () => {
          dates += 1;
          return new Date(`2020-01-01T00:00:0${dates}.000Z`);
        },
      },
    }).runTurn({ ...turn, request });

    await provider.started.promise;
    expect(provider.requests[0]?.request).toMatchObject({ timeoutMs: 4_000 });
    expect(provider.requests[0]?.request?.signal).not.toBe(
      engineController.signal,
    );
    expect(provider.requests[0]?.request?.signal).not.toBe(
      turnController.signal,
    );
    expect(request).toEqual({
      signal: turnController.signal,
      timeoutMs: 4_000,
    });

    turnController.abort("turn cancelled");
    engineController.abort("later engine cancellation");
    expect(provider.requests[0]?.request?.signal?.reason).toBe(
      "turn cancelled",
    );
    provider.result.resolve(response());
    await expect(promise).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.ProviderExecution,
      reason: "turn cancelled",
    });
    expect(ids).toBe(1);
    expect(dates).toBe(1);
    expect(turn.conversation.messages).toHaveLength(0);
  });

  it("honors engine cancellation while provider execution is pending", async () => {
    const controller = new AbortController();
    const provider = new ControlledProvider();
    const promise = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
    }).runTurn(turn);

    await provider.started.promise;
    controller.abort("engine cancelled");
    provider.result.resolve(response());

    await expect(promise).rejects.toBeInstanceOf(ConversationTurnAbortedError);
    expect(provider.requests[0]?.request?.signal?.aborted).toBe(true);
  });

  it("propagates the exact provider abort error", async () => {
    const provider = new ControlledProvider();
    const failure = new ProviderAbortError("controlled");
    provider.failure = failure;

    await expect(
      createConversationEngine({ providers: resolver(provider) }).runTurn(turn),
    ).rejects.toBe(failure);
  });

  it("rejects cancellation during assistant append instead of returning success", async () => {
    const controller = new AbortController();
    let ids = 0;
    let dates = 0;
    const provider: LLMProvider = {
      metadata: { name: "immediate", version: "1.0.0" },
      async checkHealth() {
        return { status: ProviderHealthStatus.Healthy } as const;
      },
      async generate() {
        return response();
      },
    };
    const promise = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
      conversationFactory: {
        idGenerator: () => `id-${++ids}`,
        now: () => {
          dates += 1;
          if (dates === 2) controller.abort("assistant appended");
          return new Date(`2020-01-01T00:00:0${dates}.000Z`);
        },
      },
    }).runTurn(turn);

    await expect(promise).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.AssistantAppend,
      reason: "assistant appended",
    });
    expect(ids).toBe(2);
    expect(dates).toBe(2);
    expect(turn.conversation.messages).toHaveLength(0);
  });

  it("cleans composition listeners after success, cancellation, and provider failure", async () => {
    for (const outcome of ["success", "cancel", "failure"] as const) {
      const engineController = new AbortController();
      const turnController = new AbortController();
      const add = vi.spyOn(engineController.signal, "addEventListener");
      const remove = vi.spyOn(engineController.signal, "removeEventListener");
      const provider = new ControlledProvider();
      const providerFailure = new Error("provider failed");
      if (outcome === "failure") provider.failure = providerFailure;
      const promise = createConversationEngine({
        providers: resolver(provider),
        signal: engineController.signal,
      }).runTurn({
        ...turn,
        request: { signal: turnController.signal },
      });

      await provider.started.promise;
      if (outcome === "cancel") turnController.abort("cancelled");
      if (outcome !== "failure") provider.result.resolve(response());

      if (outcome === "success") await expect(promise).resolves.toBeDefined();
      if (outcome === "cancel") {
        await expect(promise).rejects.toBeInstanceOf(
          ConversationTurnAbortedError,
        );
      }
      if (outcome === "failure")
        await expect(promise).rejects.toBe(providerFailure);

      expect(add).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects malformed engine signals with the existing options error", () => {
    expect(
      () =>
        new ConversationEngine({
          providers: resolver(new ControlledProvider()),
          signal: 42 as never,
        }),
    ).toThrow(ConversationEngineError);
  });

  it("does not accumulate composition listeners across repeated turns", async () => {
    const engineController = new AbortController();
    const turnController = new AbortController();
    const add = vi.spyOn(engineController.signal, "addEventListener");
    const remove = vi.spyOn(engineController.signal, "removeEventListener");
    const provider: LLMProvider = {
      metadata: { name: "immediate", version: "1.0.0" },
      async checkHealth() {
        return { status: ProviderHealthStatus.Healthy } as const;
      },
      async generate() {
        return response();
      },
    };
    const engine = createConversationEngine({
      providers: resolver(provider),
      signal: engineController.signal,
    });

    await engine.runTurn({
      ...turn,
      request: { signal: turnController.signal },
    });
    await engine.runTurn({
      ...turn,
      request: { signal: turnController.signal },
    });

    expect(add).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
