import {
  ConversationEngineError,
  ConversationProviderStreamingUnsupportedError,
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
  LLMProvider,
  LLMStreamEvent,
  LLMStreamingProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const timestamp = "2020-01-01T00:00:00.000Z";

function initialConversation() {
  return createConversation({ id: "conversation", createdAt: timestamp });
}

function completedResponse(content: string): Readonly<LLMGenerationResponse> {
  return Object.freeze({
    model: "stream-model",
    message: Object.freeze({
      role: LLMMessageRole.Assistant,
      content,
    }),
    finishReason: LLMFinishReason.Stop,
  });
}

class StreamingFake implements LLMStreamingProvider {
  readonly metadata = Object.freeze({ name: "streaming", version: "1.0.0" });
  readonly requests: LLMGenerationRequest[] = [];
  iterations = 0;
  cleanups = 0;
  events: readonly LLMStreamEvent[] = [];
  error: unknown;

  async checkHealth() {
    return { status: ProviderHealthStatus.Healthy } as const;
  }

  async generate(): Promise<LLMGenerationResponse> {
    throw new Error("generate must not be called");
  }

  async *stream(request: LLMGenerationRequest): AsyncIterable<LLMStreamEvent> {
    this.iterations += 1;
    this.requests.push(request);
    try {
      for (const event of this.events) yield event;
      if (this.error !== undefined) throw this.error;
    } finally {
      this.cleanups += 1;
    }
  }
}

function resolver(
  provider: LLMProvider,
  counters?: { named: number; default: number },
) {
  return {
    getLLMProvider(name: string) {
      if (counters !== undefined) counters.named += 1;
      return name === provider.metadata.name ? provider : undefined;
    },
    getDefaultLLMProvider() {
      if (counters !== undefined) counters.default += 1;
      return provider;
    },
  };
}

async function collect(
  iterable: AsyncIterable<ConversationStreamEvent>,
): Promise<ConversationStreamEvent[]> {
  const events: ConversationStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("ConversationEngine streaming", () => {
  it("is lazy before iteration begins", async () => {
    const provider = new StreamingFake();
    provider.events = [
      { type: "completed", response: completedResponse("Done") },
    ];
    const counts = { named: 0, default: 0 };
    let generatedIds = 0;
    const engine = createConversationEngine({
      providers: resolver(provider, counts),
      conversationFactory: {
        idGenerator: () => `id-${++generatedIds}`,
        now: () => new Date(timestamp),
      },
    });

    const stream = engine.streamTurn(null as never);
    expect(counts.default).toBe(0);
    expect(provider.iterations).toBe(0);
    expect(generatedIds).toBe(0);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeDefined();
    expect(counts.default).toBe(0);
    expect(generatedIds).toBe(0);
  });

  it("emits started, accumulated deltas, and one final completed event", async () => {
    const provider = new StreamingFake();
    provider.events = [
      { type: "delta", model: "reported-model", delta: "Hello" },
      { type: "delta", model: "reported-model", delta: " " },
      { type: "delta", model: "reported-model", delta: "world" },
      { type: "completed", response: completedResponse("Hello world") },
    ];
    const ids = ["user", "assistant"];
    const dates = [
      new Date("2026-07-16T10:01:00.000Z"),
      new Date("2026-07-16T10:02:00.000Z"),
    ];
    const engine = createConversationEngine({
      providers: resolver(provider),
      conversationFactory: {
        idGenerator: () => ids.shift() ?? "unexpected",
        now: () => dates.shift() ?? new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    const events = await collect(
      engine.streamTurn({
        conversation: initialConversation(),
        content: "Question",
        model: "requested-model",
        generation: { temperature: 0.4 },
        request: { timeoutMs: 2_000 },
      }),
    );

    expect(events.map(({ type }) => type)).toEqual([
      "started",
      "delta",
      "delta",
      "delta",
      "completed",
    ]);
    expect(events[0]).toMatchObject({
      type: "started",
      provider: "streaming",
      model: "requested-model",
      userMessage: { id: "user", content: "Question" },
      conversation: { messages: [{ content: "Question" }] },
    });
    expect(events.slice(1, 4)).toMatchObject([
      { delta: "Hello", content: "Hello", model: "reported-model" },
      { delta: " ", content: "Hello ", model: "reported-model" },
      { delta: "world", content: "Hello world", model: "reported-model" },
    ]);
    const completed = events.at(-1);
    expect(completed).toMatchObject({
      type: "completed",
      provider: "streaming",
      assistantMessage: { id: "assistant", content: "Hello world" },
      conversation: {
        messages: [{ content: "Question" }, { content: "Hello world" }],
      },
    });
    expect(events.filter(({ type }) => type === "completed")).toHaveLength(1);
    expect(events.every(Object.isFrozen)).toBe(true);
    expect(provider.requests[0]).toEqual({
      model: "requested-model",
      messages: [{ role: LLMMessageRole.User, content: "Question" }],
      generation: { temperature: 0.4 },
      request: { timeoutMs: 2_000 },
    });
    expect(provider.cleanups).toBe(1);
  });

  it("accepts a zero-delta stream with complete response content", async () => {
    const provider = new StreamingFake();
    provider.events = [
      { type: "completed", response: completedResponse("Complete response") },
    ];
    const events = await collect(
      createConversationEngine({ providers: resolver(provider) }).streamTurn({
        conversation: initialConversation(),
        content: "Question",
        model: "model",
      }),
    );

    expect(events.map(({ type }) => type)).toEqual(["started", "completed"]);
    expect(events.at(-1)).toMatchObject({
      assistantMessage: { content: "Complete response" },
    });
  });

  it("ignores empty provider deltas", async () => {
    const provider = new StreamingFake();
    provider.events = [
      { type: "delta", model: "model", delta: "" },
      { type: "completed", response: completedResponse("Complete") },
    ];
    const events = await collect(
      createConversationEngine({ providers: resolver(provider) }).streamTurn({
        conversation: initialConversation(),
        content: "Question",
        model: "model",
      }),
    );

    expect(events.map(({ type }) => type)).toEqual(["started", "completed"]);
  });

  it("rejects providers without streaming instead of falling back", async () => {
    let generateCalls = 0;
    const provider: LLMProvider = {
      metadata: { name: "complete-only", version: "1.0.0" },
      async checkHealth() {
        return { status: ProviderHealthStatus.Healthy };
      },
      async generate() {
        generateCalls += 1;
        return completedResponse("response");
      },
    };

    await expect(
      collect(
        createConversationEngine({ providers: resolver(provider) }).streamTurn({
          conversation: initialConversation(),
          content: "Question",
          model: "model",
        }),
      ),
    ).rejects.toBeInstanceOf(ConversationProviderStreamingUnsupportedError);
    expect(generateCalls).toBe(0);
  });
});

describe("ConversationEngine stream protocol", () => {
  it.each([
    {
      name: "missing completion",
      events: [{ type: "delta", model: "model", delta: "partial" }],
    },
    {
      name: "mismatched completion content",
      events: [
        { type: "delta", model: "model", delta: "partial" },
        { type: "completed", response: completedResponse("different") },
      ],
    },
    {
      name: "second completion",
      events: [
        { type: "completed", response: completedResponse("done") },
        { type: "completed", response: completedResponse("done") },
      ],
    },
    {
      name: "delta after completion",
      events: [
        { type: "completed", response: completedResponse("done") },
        { type: "delta", model: "model", delta: "trailing" },
      ],
    },
  ])("rejects $name without an engine completion event", async ({ events }) => {
    const provider = new StreamingFake();
    provider.events = events as LLMStreamEvent[];
    const consumed: ConversationStreamEvent[] = [];

    await expect(
      (async () => {
        for await (const event of createConversationEngine({
          providers: resolver(provider),
        }).streamTurn({
          conversation: initialConversation(),
          content: "Question",
          model: "model",
        })) {
          consumed.push(event);
        }
      })(),
    ).rejects.toBeInstanceOf(ConversationEngineError);
    expect(consumed.some(({ type }) => type === "completed")).toBe(false);
  });

  it.each(["before completion", "after completion"])(
    "propagates a provider error %s without generating assistant identity",
    async (position) => {
      const provider = new StreamingFake();
      const failure = new Error("provider failed");
      provider.events =
        position === "after completion"
          ? [{ type: "completed", response: completedResponse("done") }]
          : [{ type: "delta", model: "model", delta: "partial" }];
      provider.error = failure;
      let ids = 0;
      let dates = 0;
      const consumed: ConversationStreamEvent[] = [];
      const engine = createConversationEngine({
        providers: resolver(provider),
        conversationFactory: {
          idGenerator: () => `id-${++ids}`,
          now: () => {
            dates += 1;
            return new Date(`2026-07-16T10:0${dates}:00.000Z`);
          },
        },
      });

      await expect(
        (async () => {
          for await (const event of engine.streamTurn({
            conversation: initialConversation(),
            content: "Question",
            model: "model",
          })) {
            consumed.push(event);
          }
        })(),
      ).rejects.toBe(failure);
      expect(ids).toBe(1);
      expect(dates).toBe(1);
      expect(consumed.some(({ type }) => type === "completed")).toBe(false);
    },
  );

  it("closes the provider iterator when the consumer stops early", async () => {
    const provider = new StreamingFake();
    provider.events = [
      { type: "delta", model: "model", delta: "first" },
      { type: "delta", model: "model", delta: "second" },
      { type: "completed", response: completedResponse("firstsecond") },
    ];
    let sawDelta = false;

    for await (const event of createConversationEngine({
      providers: resolver(provider),
    }).streamTurn({
      conversation: initialConversation(),
      content: "Question",
      model: "model",
    })) {
      if (event.type === "delta") {
        sawDelta = true;
        break;
      }
    }

    expect(sawDelta).toBe(true);
    expect(provider.cleanups).toBe(1);
  });
});
