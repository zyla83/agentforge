import { InvalidConversationError, createConversation } from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const createdAt = "2026-07-15T12:00:00.000Z";

describe("createConversation", () => {
  it("creates a frozen empty conversation", () => {
    const conversation = createConversation(
      { id: "conversation", createdAt },
      { idGenerator: () => "unused", now: () => new Date(0) },
    );

    expect(conversation).toEqual({
      id: "conversation",
      createdAt,
      updatedAt: createdAt,
      messages: [],
    });
    expect(Object.isFrozen(conversation)).toBe(true);
    expect(Object.isFrozen(conversation.messages)).toBe(true);
  });

  it("generates its ID and timestamp", () => {
    const conversation = createConversation(undefined, {
      idGenerator: () => "generated-conversation",
      now: () => new Date(createdAt),
    });

    expect(conversation.id).toBe("generated-conversation");
    expect(conversation.createdAt).toBe(createdAt);
    expect(conversation.updatedAt).toBe(createdAt);
  });

  it("creates initial messages in input order and derives updatedAt", () => {
    const conversation = createConversation({
      id: "conversation",
      createdAt,
      messages: [
        {
          id: "assistant",
          role: LLMMessageRole.Assistant,
          content: "First",
          createdAt: "2026-07-15T12:01:00.000Z",
        },
        {
          id: "system",
          role: LLMMessageRole.System,
          content: "Second",
          createdAt: "2026-07-15T14:02:00+02:00",
        },
        {
          id: "user",
          role: LLMMessageRole.User,
          content: "Third",
          createdAt: "2026-07-15T12:03:00.000Z",
        },
      ],
    });

    expect(conversation.messages.map(({ id }) => id)).toEqual([
      "assistant",
      "system",
      "user",
    ]);
    expect(conversation.updatedAt).toBe("2026-07-15T12:03:00.000Z");
    expect(conversation.messages.every(Object.isFrozen)).toBe(true);
  });

  it("does not mutate the input object or messages array", () => {
    const messages = [
      {
        id: "message",
        role: LLMMessageRole.User,
        content: "Hello",
        createdAt,
      },
    ];
    const input = { id: "conversation", createdAt, messages };

    const conversation = createConversation(input);

    expect(input.messages).toBe(messages);
    expect(messages).toHaveLength(1);
    expect(conversation.messages).not.toBe(messages);
    expect(conversation.messages[0]).not.toBe(messages[0]);
  });

  it("generates missing conversation and message IDs in call order", () => {
    const ids = ["conversation", "first", "second"];
    const conversation = createConversation(
      {
        createdAt,
        messages: [
          { role: LLMMessageRole.User, content: "One", createdAt },
          { role: LLMMessageRole.Assistant, content: "Two", createdAt },
        ],
      },
      { idGenerator: () => ids.shift() ?? "unexpected" },
    );

    expect(conversation.id).toBe("conversation");
    expect(conversation.messages.map(({ id }) => id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("rejects duplicate initial message IDs", () => {
    expect(() =>
      createConversation({
        id: "conversation",
        createdAt,
        messages: [
          {
            id: "duplicate",
            role: LLMMessageRole.User,
            content: "One",
            createdAt,
          },
          {
            id: "duplicate",
            role: LLMMessageRole.Assistant,
            content: "Two",
            createdAt,
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: ['messages[1].id: duplicate message ID "duplicate"'],
      }),
    );
  });

  it.each([
    ["message before creation", "2026-07-15T11:59:59.000Z", createdAt],
    [
      "message before its predecessor",
      "2026-07-15T12:01:00.000Z",
      "2026-07-15T12:00:30.000Z",
    ],
  ])("rejects %s", (_name, firstTimestamp, secondTimestamp) => {
    const messages =
      firstTimestamp < createdAt
        ? [
            {
              id: "first",
              role: LLMMessageRole.User,
              content: "First",
              createdAt: firstTimestamp,
            },
          ]
        : [
            {
              id: "first",
              role: LLMMessageRole.User,
              content: "First",
              createdAt: firstTimestamp,
            },
            {
              id: "second",
              role: LLMMessageRole.Assistant,
              content: "Second",
              createdAt: secondTimestamp,
            },
          ];

    expect(() =>
      createConversation({ id: "conversation", createdAt, messages }),
    ).toThrow(InvalidConversationError);
  });

  it.each(["", " ", 42, null])("rejects invalid conversation ID %#", (id) => {
    expect(() => createConversation({ id: id as string, createdAt })).toThrow(
      InvalidConversationError,
    );
  });
});
