import {
  InvalidConversationError,
  InvalidConversationMessageError,
  appendConversationMessage,
  createConversation,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const initialTimestamp = "2026-07-15T12:00:00.000Z";

describe("appendConversationMessage", () => {
  it.each(Object.values(LLMMessageRole))("appends a %s message", (role) => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
    });
    const result = appendConversationMessage(initial, {
      id: `message-${role}`,
      role,
      content: "Content",
      createdAt: "2026-07-15T12:01:00.000Z",
    });

    expect(result.messages.at(-1)).toMatchObject({ role, content: "Content" });
  });

  it("creates a new immutable snapshot without changing the original", () => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
      messages: [
        {
          id: "first",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: initialTimestamp,
        },
      ],
    });
    const originalMessages = initial.messages;

    const result = appendConversationMessage(initial, {
      id: "second",
      role: LLMMessageRole.Assistant,
      content: "Hello!",
      createdAt: "2026-07-15T12:01:00.000Z",
    });

    expect(result).not.toBe(initial);
    expect(initial.messages).toBe(originalMessages);
    expect(initial.messages).toHaveLength(1);
    expect(initial.updatedAt).toBe(initialTimestamp);
    expect(result.messages.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(result.messages[0]).toBe(initial.messages[0]);
    expect(result.updatedAt).toBe("2026-07-15T12:01:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.messages)).toBe(true);
    expect(Object.isFrozen(result.messages[1])).toBe(true);
  });

  it("generates an ID and timestamp for the appended message", () => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
    });
    const result = appendConversationMessage(
      initial,
      { role: LLMMessageRole.User, content: "Hello" },
      {
        idGenerator: () => "generated-message",
        now: () => new Date("2026-07-15T12:02:00.000Z"),
      },
    );

    expect(result.messages[0]?.id).toBe("generated-message");
    expect(result.updatedAt).toBe("2026-07-15T12:02:00.000Z");
  });

  it("allows a timestamp equal to the current updatedAt", () => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
    });

    expect(() =>
      appendConversationMessage(initial, {
        id: "message",
        role: LLMMessageRole.User,
        content: "Hello",
        createdAt: initialTimestamp,
      }),
    ).not.toThrow();
  });

  it("rejects duplicate message IDs without trimming or normalizing", () => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
      messages: [
        {
          id: "message-1",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: initialTimestamp,
        },
      ],
    });

    expect(() =>
      appendConversationMessage(initial, {
        id: "message-1",
        role: LLMMessageRole.Assistant,
        content: "Duplicate",
        createdAt: initialTimestamp,
      }),
    ).toThrowError(
      expect.objectContaining({
        details: ['id: duplicate message ID "message-1"'],
      }),
    );
    expect(() =>
      appendConversationMessage(initial, {
        id: "Message-1",
        role: LLMMessageRole.Assistant,
        content: "Distinct",
        createdAt: initialTimestamp,
      }),
    ).not.toThrow();
  });

  it("rejects a message earlier than the current snapshot", () => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
      messages: [
        {
          id: "first",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: "2026-07-15T12:01:00.000Z",
        },
      ],
    });

    expect(() =>
      appendConversationMessage(initial, {
        id: "second",
        role: LLMMessageRole.Assistant,
        content: "Hello!",
        createdAt: initialTimestamp,
      }),
    ).toThrow(InvalidConversationMessageError);
  });

  it("rejects an invalid source before validating the new message", () => {
    expect(() =>
      appendConversationMessage({ id: "broken" } as never, {
        role: "tool" as LLMMessageRole,
        content: "",
      }),
    ).toThrow(InvalidConversationError);
  });

  it("rejects an invalid appended message", () => {
    const initial = createConversation({
      id: "conversation",
      createdAt: initialTimestamp,
    });

    expect(() =>
      appendConversationMessage(initial, {
        role: "tool" as LLMMessageRole,
        content: "",
      }),
    ).toThrow(InvalidConversationMessageError);
  });
});
