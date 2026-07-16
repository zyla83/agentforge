import {
  ConversationEngine,
  ConversationEngineError,
  InvalidConversationError,
  InvalidConversationTurnError,
  createConversation,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const providers = {
  getLLMProvider() {
    return undefined;
  },
  getDefaultLLMProvider() {
    return undefined;
  },
};

const conversation = createConversation({
  id: "conversation",
  createdAt: "2026-07-16T10:00:00.000Z",
});

describe("ConversationEngine option validation", () => {
  it.each([undefined, null, [], "options", 42])(
    "rejects malformed options %#",
    (options) => {
      expect(() => new ConversationEngine(options as never)).toThrow(
        ConversationEngineError,
      );
    },
  );

  it.each([
    {},
    { providers: null },
    { providers: {} },
    { providers: { getLLMProvider() {} } },
    { providers: { getDefaultLLMProvider() {} } },
  ])("rejects malformed provider resolver %#", (options) => {
    expect(() => new ConversationEngine(options as never)).toThrow(
      ConversationEngineError,
    );
  });

  it.each([null, [], { idGenerator: "generator" }, { now: "clock" }])(
    "rejects malformed conversation factory %#",
    (conversationFactory) => {
      expect(
        () =>
          new ConversationEngine({ providers, conversationFactory } as never),
      ).toThrow(ConversationEngineError);
    },
  );

  it("snapshots factory functions without mutating options", () => {
    const firstGenerator = () => "first";
    const factory = { idGenerator: firstGenerator };
    const options = { providers, conversationFactory: factory };

    const engine = new ConversationEngine(options);
    factory.idGenerator = () => "replacement";

    expect(engine).toBeInstanceOf(ConversationEngine);
    expect(options.conversationFactory).toBe(factory);
  });
});

describe("ConversationEngine turn validation", () => {
  const engine = new ConversationEngine({ providers });

  it.each([undefined, null, [], "turn", 42])(
    "rejects malformed turn input %#",
    async (input) => {
      await expect(engine.runTurn(input as never)).rejects.toBeInstanceOf(
        InvalidConversationTurnError,
      );
    },
  );

  it("reports shape errors in deterministic order and freezes details", async () => {
    const error = await engine
      .runTurn({
        content: " ",
        model: 42,
        provider: " ",
        generation: { temperature: 3 },
        request: { timeoutMs: 0 },
      } as never)
      .catch((caught) => caught as InvalidConversationTurnError);

    expect(error).toBeInstanceOf(InvalidConversationTurnError);
    expect(error.details).toEqual([
      "conversation: is required",
      "content: must be a non-empty string",
      "model: must be a non-empty string",
      "provider: must be a non-empty string when provided",
      "generation.temperature: must be between 0 and 2",
      "request.timeoutMs: must be a positive finite integer",
    ]);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it("rejects malformed generation and request objects", async () => {
    const error = await engine
      .runTurn({
        conversation,
        content: "Hello",
        model: "model",
        generation: [] as never,
        request: "request" as never,
      })
      .catch((caught) => caught as InvalidConversationTurnError);

    expect(error).toMatchObject({
      details: ["generation: must be an object", "request: must be an object"],
    });
    expect(error.cause).toBeDefined();
  });

  it("rejects malformed runtime request signals", async () => {
    await expect(
      engine.runTurn({
        conversation,
        content: "Hello",
        model: "model",
        request: { signal: 42 as never },
      }),
    ).rejects.toMatchObject({
      details: ["request.signal: must be an AbortSignal"],
    });
  });

  it("propagates source conversation validation consistently", async () => {
    await expect(
      engine.runTurn({
        conversation: {
          id: "broken",
          createdAt: "invalid",
          updatedAt: "invalid",
          messages: [],
        },
        content: "Hello",
        model: "model",
      }),
    ).rejects.toBeInstanceOf(InvalidConversationError);
  });

  it("preserves non-empty strings exactly until provider resolution", async () => {
    await expect(
      engine.runTurn({
        conversation,
        content: "  Hello  ",
        model: "  model  ",
        provider: " Missing ",
      }),
    ).rejects.toMatchObject({ provider: " Missing " });
  });

  it("accepts all supported user history roles", () => {
    expect(
      createConversation({
        id: "roles",
        createdAt: "2026-07-16T10:00:00.000Z",
        messages: Object.values(LLMMessageRole).map((role, index) => ({
          id: String(index),
          role,
          content: role,
          createdAt: "2026-07-16T10:00:00.000Z",
        })),
      }),
    ).toBeDefined();
  });
});
