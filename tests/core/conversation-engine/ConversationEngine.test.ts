import {
  ConversationEngine,
  ConversationProviderNotFoundError,
  createConversation,
  createConversationEngine,
} from "@agentforge/core";
import { MockLLMProvider } from "@agentforge/provider-mock";
import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderHealthStatus,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const initialTimestamp = "2020-01-01T00:00:00.000Z";

function createInitialConversation() {
  return createConversation({
    id: "conversation",
    createdAt: initialTimestamp,
    messages: [
      {
        id: "system",
        role: LLMMessageRole.System,
        content: "Be concise.",
        createdAt: initialTimestamp,
      },
    ],
  });
}

function createResolver(
  providers: Record<string, LLMProvider>,
  defaultName?: string,
) {
  return {
    getLLMProvider(name: string) {
      return providers[name];
    },
    getDefaultLLMProvider() {
      return defaultName === undefined ? undefined : providers[defaultName];
    },
  };
}

function deterministicFactory() {
  const ids = ["user-message", "assistant-message"];
  const dates = [
    new Date("2026-07-16T10:01:00.000Z"),
    new Date("2026-07-16T10:02:00.000Z"),
  ];
  return {
    idGenerator: () => ids.shift() ?? "unexpected-id",
    now: () => dates.shift() ?? new Date("2099-01-01T00:00:00.000Z"),
  };
}

describe("ConversationEngine complete turns", () => {
  it("resolves the default provider and returns an immutable completed turn", async () => {
    const provider = new MockLLMProvider({
      name: "default-provider",
      responseContent: "Hello from the provider.",
    });
    const source = createInitialConversation();
    const result = await createConversationEngine({
      providers: createResolver(
        { "default-provider": provider },
        "default-provider",
      ),
      conversationFactory: deterministicFactory(),
    }).runTurn({
      conversation: source,
      content: "Hello",
      model: "example-model",
    });

    expect(result.provider).toBe("default-provider");
    expect(result.conversation.messages.map(({ content }) => content)).toEqual([
      "Be concise.",
      "Hello",
      "Hello from the provider.",
    ]);
    expect(result.userMessage).toBe(result.conversation.messages.at(-2));
    expect(result.assistantMessage).toBe(result.conversation.messages.at(-1));
    expect(result.userMessage.id).toBe("user-message");
    expect(result.assistantMessage.id).toBe("assistant-message");
    expect(result.response.message.content).toBe("Hello from the provider.");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.conversation)).toBe(true);
    expect(Object.isFrozen(result.userMessage)).toBe(true);
    expect(Object.isFrozen(result.assistantMessage)).toBe(true);
    expect(source.messages).toHaveLength(1);
    expect(source.updatedAt).toBe(initialTimestamp);
  });

  it("uses an explicit exact provider instead of the default", async () => {
    const defaultProvider = new MockLLMProvider({
      name: "default",
      responseContent: "Default",
    });
    const explicitProvider = new MockLLMProvider({
      name: "Explicit",
      responseContent: "Explicit",
    });
    const engine = new ConversationEngine({
      providers: createResolver(
        { default: defaultProvider, Explicit: explicitProvider },
        "default",
      ),
      conversationFactory: deterministicFactory(),
    });

    const result = await engine.runTurn({
      conversation: createInitialConversation(),
      content: "Hello",
      model: "model",
      provider: "Explicit",
    });

    expect(result.provider).toBe("Explicit");
    expect(result.assistantMessage.content).toBe("Explicit");
    expect(defaultProvider.getRequests()).toEqual([]);
    expect(explicitProvider.getRequests()).toHaveLength(1);
  });

  it("forwards full history, model, generation, and request options", async () => {
    const provider = new MockLLMProvider({ responseContent: "Response" });
    const controller = new AbortController();
    const generation = {
      temperature: 0.3,
      topP: 0.8,
      maxTokens: 64,
      stop: ["END"],
    };
    const request = { signal: controller.signal, timeoutMs: 4_000 };
    const engine = createConversationEngine({
      providers: createResolver({ "mock-llm": provider }, "mock-llm"),
      conversationFactory: deterministicFactory(),
    });

    await engine.runTurn({
      conversation: createInitialConversation(),
      content: "User content",
      model: " model-with-spaces ",
      generation,
      request,
    });

    expect(provider.getRequests()[0]).toEqual({
      model: " model-with-spaces ",
      messages: [
        { role: LLMMessageRole.System, content: "Be concise." },
        { role: LLMMessageRole.User, content: "User content" },
      ],
      generation,
      request,
    });
    expect(generation).toEqual({
      temperature: 0.3,
      topP: 0.8,
      maxTokens: 64,
      stop: ["END"],
    });
    expect(request.signal).toBe(controller.signal);
  });

  it("reports missing default and explicit providers without fallback", async () => {
    const provider = new MockLLMProvider({ name: "default" });
    const engine = createConversationEngine({
      providers: createResolver({ default: provider }),
    });
    await expect(
      engine.runTurn({
        conversation: createInitialConversation(),
        content: "Hello",
        model: "model",
      }),
    ).rejects.toMatchObject({
      message: "No default LLM provider is registered.",
      provider: undefined,
    });

    const withDefault = createConversationEngine({
      providers: createResolver({ default: provider }, "default"),
    });
    await expect(
      withDefault.runTurn({
        conversation: createInitialConversation(),
        content: "Hello",
        model: "model",
        provider: "missing",
      }),
    ).rejects.toBeInstanceOf(ConversationProviderNotFoundError);
    expect(provider.getRequests()).toEqual([]);
  });

  it("propagates provider failures and does not generate assistant identity", async () => {
    const failure = new Error("generation failed");
    const generatedIds: string[] = [];
    const generatedDates: Date[] = [];
    const provider = createFailingProvider(failure);
    const engine = createConversationEngine({
      providers: createResolver({ failing: provider }, "failing"),
      conversationFactory: {
        idGenerator() {
          const id = `id-${generatedIds.length + 1}`;
          generatedIds.push(id);
          return id;
        },
        now() {
          const date = new Date(
            `2026-07-16T10:0${generatedDates.length + 1}:00.000Z`,
          );
          generatedDates.push(date);
          return date;
        },
      },
    });

    await expect(
      engine.runTurn({
        conversation: createInitialConversation(),
        content: "Hello",
        model: "model",
      }),
    ).rejects.toBe(failure);
    expect(generatedIds).toEqual(["id-1"]);
    expect(generatedDates).toHaveLength(1);
  });

  it("keeps repeated and concurrent turns independent", async () => {
    const provider = new MockLLMProvider({ responseContent: "Response" });
    const engine = createConversationEngine({
      providers: createResolver({ "mock-llm": provider }, "mock-llm"),
    });
    const source = createInitialConversation();

    const [first, second] = await Promise.all([
      engine.runTurn({
        conversation: source,
        content: "First",
        model: "model",
      }),
      engine.runTurn({
        conversation: source,
        content: "Second",
        model: "model",
      }),
    ]);

    expect(source.messages).toHaveLength(1);
    expect(first.conversation).not.toBe(second.conversation);
    expect(first.userMessage.content).toBe("First");
    expect(second.userMessage.content).toBe("Second");
    expect(first.conversation.messages).toHaveLength(3);
    expect(second.conversation.messages).toHaveLength(3);
  });
});

function createFailingProvider(error: unknown): LLMProvider {
  return {
    metadata: { name: "failing", version: "1.0.0" },
    async checkHealth() {
      return { status: ProviderHealthStatus.Healthy };
    },
    async generate(_request: LLMGenerationRequest) {
      throw error;
    },
  };
}
