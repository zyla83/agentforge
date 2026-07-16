import {
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
  LLMStreamEvent,
  LLMStreamingProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function completed(content = "partial"): LLMStreamEvent {
  return {
    type: "completed",
    response: {
      model: "model",
      message: { role: LLMMessageRole.Assistant, content },
      finishReason: LLMFinishReason.Stop,
    },
  };
}

class ControlledStreamingProvider implements LLMStreamingProvider {
  readonly metadata = { name: "streaming", version: "1.0.0" };
  readonly requests: LLMGenerationRequest[] = [];
  readonly afterCompletedGate = deferred();
  readonly waitingAfterCompleted = deferred();
  events: readonly LLMStreamEvent[] = [
    { type: "delta", model: "model", delta: "partial" },
    completed(),
  ];
  waitAfterCompleted = false;
  abortOnExhaustion: AbortController | undefined;
  failure: unknown;
  cleanups = 0;

  async checkHealth() {
    return { status: ProviderHealthStatus.Healthy } as const;
  }

  async generate(): Promise<LLMGenerationResponse> {
    throw new Error("generate must not be called");
  }

  async *stream(request: LLMGenerationRequest): AsyncIterable<LLMStreamEvent> {
    this.requests.push(request);
    try {
      for (const event of this.events) yield event;
      if (this.waitAfterCompleted) {
        this.waitingAfterCompleted.resolve();
        await this.afterCompletedGate.promise;
      }
      if (this.failure !== undefined) throw this.failure;
      this.abortOnExhaustion?.abort("after clean exhaustion");
    } finally {
      this.cleanups += 1;
    }
  }
}

function resolver(provider: ControlledStreamingProvider) {
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

describe("ConversationEngine streaming cancellation", () => {
  it("remains lazy and registers no signal listeners before iteration", async () => {
    const engineController = new AbortController();
    const turnController = new AbortController();
    const addEngine = vi.spyOn(engineController.signal, "addEventListener");
    const addTurn = vi.spyOn(turnController.signal, "addEventListener");
    const provider = new ControlledStreamingProvider();
    const stream = createConversationEngine({
      providers: resolver(provider),
      signal: engineController.signal,
    }).streamTurn({
      ...turn,
      request: { signal: turnController.signal },
    });

    expect(addEngine).not.toHaveBeenCalled();
    expect(addTurn).not.toHaveBeenCalled();
    expect(provider.requests).toHaveLength(0);

    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "started" },
    });
    expect(addEngine).toHaveBeenCalledTimes(1);
    expect(addTurn).toHaveBeenCalledTimes(1);
    await iterator.return?.();
  });

  it("gives an already-aborted signal precedence before started", async () => {
    const controller = new AbortController();
    controller.abort("already cancelled");
    const provider = new ControlledStreamingProvider();
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
    })
      .streamTurn(null as never)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.Validation,
      reason: "already cancelled",
    });
    expect(provider.requests).toHaveLength(0);
  });

  it("cancels after user append without emitting started", async () => {
    const controller = new AbortController();
    const provider = new ControlledStreamingProvider();
    let ids = 0;
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
      conversationFactory: {
        idGenerator: () => `id-${++ids}`,
        now: () => {
          controller.abort("user appended");
          return new Date("2020-01-01T00:00:01.000Z");
        },
      },
    })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.UserAppend,
    });
    expect(ids).toBe(1);
    expect(provider.requests).toHaveLength(0);
    expect(turn.conversation.messages).toHaveLength(0);
  });

  it("cancels after started before opening the provider stream", async () => {
    const controller = new AbortController();
    const provider = new ControlledStreamingProvider();
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
    })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "started" },
    });
    controller.abort("after started");
    await expect(iterator.next()).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.ProviderExecution,
      reason: "after started",
    });
    expect(provider.requests).toHaveLength(0);
  });

  it.each(["engine", "turn"] as const)(
    "honors %s cancellation after a delta and closes the provider iterator",
    async (source) => {
      const engineController = new AbortController();
      const turnController = new AbortController();
      const provider = new ControlledStreamingProvider();
      let ids = 0;
      const iterator = createConversationEngine({
        providers: resolver(provider),
        signal: engineController.signal,
        conversationFactory: {
          idGenerator: () => `id-${++ids}`,
          now: () => new Date("2020-01-01T00:00:01.000Z"),
        },
      })
        .streamTurn({
          ...turn,
          request: { signal: turnController.signal },
        })
        [Symbol.asyncIterator]();

      await iterator.next();
      await expect(iterator.next()).resolves.toMatchObject({
        value: { type: "delta", content: "partial" },
      });
      const controller =
        source === "engine" ? engineController : turnController;
      controller.abort(`${source} cancelled`);

      await expect(iterator.next()).rejects.toBeInstanceOf(
        ConversationTurnAbortedError,
      );
      expect(provider.cleanups).toBe(1);
      expect(ids).toBe(1);
      expect(turn.conversation.messages).toHaveLength(0);
    },
  );

  it("detects cancellation after provider completion but before exhaustion", async () => {
    const controller = new AbortController();
    const provider = new ControlledStreamingProvider();
    provider.waitAfterCompleted = true;
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
    })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await iterator.next();
    await iterator.next();
    const pending = iterator.next();
    await provider.waitingAfterCompleted.promise;
    controller.abort("after provider completed");
    provider.afterCompletedGate.resolve();

    await expect(pending).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.ProviderExecution,
    });
    expect(provider.cleanups).toBe(1);
  });

  it("detects cancellation immediately after clean provider exhaustion", async () => {
    const controller = new AbortController();
    const provider = new ControlledStreamingProvider();
    provider.abortOnExhaustion = controller;
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
    })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await iterator.next();
    await iterator.next();
    await expect(iterator.next()).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.ProviderExecution,
      reason: "after clean exhaustion",
    });
  });

  it("checks cancellation after a completed event resumes", async () => {
    const controller = new AbortController();
    const provider = new ControlledStreamingProvider();
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
    })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await iterator.next();
    await iterator.next();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "completed" },
    });
    controller.abort("after engine completed");
    await expect(iterator.next()).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.Completed,
    });
  });

  it("rejects cancellation during assistant append before engine completion", async () => {
    const controller = new AbortController();
    const provider = new ControlledStreamingProvider();
    let dates = 0;
    const iterator = createConversationEngine({
      providers: resolver(provider),
      signal: controller.signal,
      conversationFactory: {
        idGenerator: () => `id-${dates + 1}`,
        now: () => {
          dates += 1;
          if (dates === 2) controller.abort("assistant appended");
          return new Date(`2020-01-01T00:00:0${dates}.000Z`);
        },
      },
    })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await iterator.next();
    await iterator.next();
    await expect(iterator.next()).rejects.toMatchObject({
      phase: ConversationTurnExecutionPhase.AssistantAppend,
    });
    expect(turn.conversation.messages).toHaveLength(0);
  });

  it("propagates the exact provider abort error", async () => {
    const provider = new ControlledStreamingProvider();
    const failure = new ProviderAbortError("streaming");
    provider.events = [];
    provider.failure = failure;
    const iterator = createConversationEngine({ providers: resolver(provider) })
      .streamTurn(turn)
      [Symbol.asyncIterator]();

    await iterator.next();
    await expect(iterator.next()).rejects.toBe(failure);
    expect(provider.cleanups).toBe(1);
  });

  it("treats early consumer termination as cleanup rather than cancellation", async () => {
    const engineController = new AbortController();
    const turnController = new AbortController();
    const removeEngine = vi.spyOn(
      engineController.signal,
      "removeEventListener",
    );
    const removeTurn = vi.spyOn(turnController.signal, "removeEventListener");
    const provider = new ControlledStreamingProvider();

    for await (const event of createConversationEngine({
      providers: resolver(provider),
      signal: engineController.signal,
    }).streamTurn({
      ...turn,
      request: { signal: turnController.signal },
    })) {
      if (event.type === "delta") break;
    }

    expect(provider.cleanups).toBe(1);
    expect(removeEngine).toHaveBeenCalledTimes(1);
    expect(removeTurn).toHaveBeenCalledTimes(1);
    expect(engineController.signal.aborted).toBe(false);
    expect(turnController.signal.aborted).toBe(false);
  });
});
