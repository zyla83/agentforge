import {
  InvalidAgentProfileError,
  createAgentProfile,
  createConversation,
  createConversationEngine,
} from "@agentforge/core";
import type { ConversationStreamEvent } from "@agentforge/core";
import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderHealthStatus,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMStreamEvent,
  LLMStreamingProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

class ProfileStreamingProvider implements LLMStreamingProvider {
  readonly metadata = Object.freeze({
    name: "profile-provider",
    version: "1.0.0",
  });
  readonly requests: LLMGenerationRequest[] = [];
  readonly failure: unknown;
  cleanups = 0;

  constructor(failure?: unknown) {
    this.failure = failure;
  }

  async checkHealth() {
    return { status: ProviderHealthStatus.Healthy } as const;
  }

  async generate(): Promise<LLMGenerationResponse> {
    throw new Error("generate must not be called");
  }

  async *stream(request: LLMGenerationRequest): AsyncIterable<LLMStreamEvent> {
    this.requests.push(request);
    try {
      yield { type: "delta", model: "provider-reported-model", delta: "Done" };
      if (this.failure !== undefined) throw this.failure;
      yield {
        type: "completed",
        response: {
          model: "provider-reported-model",
          message: { role: LLMMessageRole.Assistant, content: "Done" },
          finishReason: LLMFinishReason.Stop,
        },
      };
    } finally {
      this.cleanups += 1;
    }
  }
}

function resolver(provider: ProfileStreamingProvider) {
  return {
    getLLMProvider: (name: string) =>
      name === provider.metadata.name ? provider : undefined,
    getDefaultLLMProvider: () => undefined,
  };
}

function profile(id = "stream-profile") {
  return createAgentProfile({
    id,
    systemPrompt: `${id} instruction.`,
    model: `${id}-model`,
    provider: "profile-provider",
    generation: { temperature: 0.2, topP: 0.8 },
  });
}

async function collect(iterable: AsyncIterable<ConversationStreamEvent>) {
  const events: ConversationStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("ConversationEngine profile streaming", () => {
  it("validates engine profiles eagerly and per-turn profiles lazily", async () => {
    const provider = new ProfileStreamingProvider();
    expect(() =>
      createConversationEngine({
        providers: resolver(provider),
        profile: { id: "bad", systemPrompt: " " },
      }),
    ).toThrow(InvalidAgentProfileError);

    const engine = createConversationEngine({ providers: resolver(provider) });
    const stream = engine.streamTurn({
      conversation: createConversation(),
      content: "Question",
      profile: { id: "bad", systemPrompt: " " },
    });
    expect(provider.requests).toHaveLength(0);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
      InvalidAgentProfileError,
    );
    expect(provider.requests).toHaveLength(0);
  });

  it("uses consistent resolved profile and model metadata in every event", async () => {
    const provider = new ProfileStreamingProvider();
    const events = await collect(
      createConversationEngine({
        providers: resolver(provider),
        profile: profile(),
      }).streamTurn({
        conversation: createConversation(),
        content: "Question",
        generation: { temperature: 0.7 },
      }),
    );

    expect(events.map(({ type }) => type)).toEqual([
      "started",
      "delta",
      "completed",
    ]);
    expect(events).toMatchObject([
      {
        type: "started",
        model: "stream-profile-model",
        profile: "stream-profile",
        provider: "profile-provider",
        conversation: { messages: [{ content: "Question" }] },
      },
      {
        type: "delta",
        model: "stream-profile-model",
        profile: "stream-profile",
        provider: "profile-provider",
      },
      {
        type: "completed",
        model: "stream-profile-model",
        profile: "stream-profile",
        provider: "profile-provider",
        conversation: {
          messages: [{ content: "Question" }, { content: "Done" }],
        },
      },
    ]);
    expect(events.every(Object.isFrozen)).toBe(true);
    expect(provider.requests[0]).toEqual({
      model: "stream-profile-model",
      messages: [
        {
          role: LLMMessageRole.System,
          content: "stream-profile instruction.",
        },
        { role: LLMMessageRole.User, content: "Question" },
      ],
      generation: { temperature: 0.7, topP: 0.8 },
    });
  });

  it("uses the per-turn profile instead of the engine profile", async () => {
    const provider = new ProfileStreamingProvider();
    const events = await collect(
      createConversationEngine({
        providers: resolver(provider),
        profile: profile("engine"),
      }).streamTurn({
        conversation: createConversation(),
        content: "Question",
        profile: profile("turn"),
      }),
    );

    expect(events.every((event) => event.profile === "turn")).toBe(true);
    expect(provider.requests[0]?.model).toBe("turn-model");
    expect(provider.requests[0]?.messages[0]?.content).toBe(
      "turn instruction.",
    );
  });

  it("propagates provider errors without appending an assistant", async () => {
    const failure = new Error("stream failed");
    const provider = new ProfileStreamingProvider(failure);
    const consumed: ConversationStreamEvent[] = [];

    await expect(
      (async () => {
        for await (const event of createConversationEngine({
          providers: resolver(provider),
          profile: profile(),
        }).streamTurn({
          conversation: createConversation(),
          content: "Question",
        })) {
          consumed.push(event);
        }
      })(),
    ).rejects.toBe(failure);
    expect(consumed.some(({ type }) => type === "completed")).toBe(false);
    expect(
      consumed.find(({ type }) => type === "started")?.conversation.messages,
    ).toHaveLength(1);
  });

  it("closes the provider iterator when the consumer stops early", async () => {
    const provider = new ProfileStreamingProvider();
    for await (const event of createConversationEngine({
      providers: resolver(provider),
      profile: profile(),
    }).streamTurn({
      conversation: createConversation(),
      content: "Question",
    })) {
      if (event.type === "delta") break;
    }

    expect(provider.cleanups).toBe(1);
  });
});
