import {
  ConversationError,
  InvalidConversationError,
  conversationToLLMMessages,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const createdAt = "2026-07-15T12:00:00.000Z";

function validConversation(): Record<string, unknown> {
  return {
    id: "conversation",
    createdAt,
    updatedAt: "2026-07-15T12:01:00.000Z",
    messages: [
      {
        id: "message-1",
        role: LLMMessageRole.User,
        content: "Hello",
        createdAt: "2026-07-15T12:01:00.000Z",
      },
    ],
  };
}

describe("conversation runtime validation", () => {
  it.each([undefined, null, [], "conversation", 42, true])(
    "rejects malformed conversation %# without leaking a native error",
    (conversation) => {
      const error = captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      );
      expect(error.details).toEqual(["conversation: must be an object"]);
    },
  );

  it("reports malformed top-level fields in deterministic order", () => {
    const error = captureConversationError(() =>
      conversationToLLMMessages({
        id: " ",
        createdAt: "2026-07-15",
        updatedAt: "invalid",
        messages: "messages",
      } as never),
    );

    expect(error.details).toEqual([
      "id: must be a non-empty string",
      "createdAt: must be a valid ISO 8601 timestamp",
      "updatedAt: must be a valid ISO 8601 timestamp",
      "messages: must be an array",
    ]);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error).toBeInstanceOf(ConversationError);
  });

  it("rejects an updated timestamp earlier than creation", () => {
    const conversation = validConversation();
    conversation.updatedAt = "2026-07-15T11:59:00.000Z";

    expect(
      captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      ).details,
    ).toContain("updatedAt: must not be earlier than createdAt");
  });

  it.each([undefined, {}, [], "message", 42])(
    "rejects malformed message entry %#",
    (message) => {
      const conversation = validConversation();
      conversation.messages = [message];

      const error = captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      );
      expect(error.details[0]).toMatch(/^messages\[0\]/);
    },
  );

  it("reports malformed message fields in deterministic order", () => {
    const conversation = validConversation();
    conversation.messages = [
      { id: "", role: "developer", content: " ", createdAt: "invalid" },
    ];
    const error = captureConversationError(() =>
      conversationToLLMMessages(conversation as never),
    );

    expect(error.details.slice(0, 4)).toEqual([
      "messages[0].id: must be a non-empty string",
      "messages[0].role: unsupported role",
      "messages[0].content: must be a non-empty string",
      "messages[0].createdAt: must be a valid ISO 8601 timestamp",
    ]);
  });

  it("rejects duplicate exact message IDs", () => {
    const conversation = validConversation();
    conversation.messages = [
      ...(conversation.messages as object[]),
      {
        id: "message-1",
        role: LLMMessageRole.Assistant,
        content: "Hello!",
        createdAt: "2026-07-15T12:01:00.000Z",
      },
    ];

    expect(
      captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      ).details,
    ).toContain('messages[1].id: duplicate message ID "message-1"');
  });

  it("rejects out-of-order timestamps", () => {
    const conversation = validConversation();
    conversation.messages = [
      {
        id: "first",
        role: LLMMessageRole.User,
        content: "First",
        createdAt: "2026-07-15T12:02:00.000Z",
      },
      {
        id: "second",
        role: LLMMessageRole.Assistant,
        content: "Second",
        createdAt: "2026-07-15T12:01:00.000Z",
      },
    ];

    expect(
      captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      ).details,
    ).toContain(
      "messages[1].createdAt: must not be earlier than the previous message",
    );
  });

  it("rejects updatedAt that differs from the last message timestamp", () => {
    const conversation = validConversation();
    conversation.updatedAt = "2026-07-15T12:02:00.000Z";

    expect(
      captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      ).details,
    ).toContain("updatedAt: must equal the latest message timestamp");
  });

  it("rejects an empty conversation whose timestamps differ", () => {
    const conversation = validConversation();
    conversation.updatedAt = "2026-07-15T12:01:00.000Z";
    conversation.messages = [];

    expect(
      captureConversationError(() =>
        conversationToLLMMessages(conversation as never),
      ).details,
    ).toEqual(["updatedAt: must equal createdAt"]);
  });

  it("accepts equivalent instants with different timezone offsets in order", () => {
    const conversation = {
      id: "conversation",
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T14:00:00+02:00",
      messages: [
        {
          id: "message",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: "2026-07-15T14:00:00+02:00",
        },
      ],
    };

    expect(() => conversationToLLMMessages(conversation)).not.toThrow();
  });
});

function captureConversationError(
  action: () => void,
): InvalidConversationError {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidConversationError) return error;
    throw error;
  }
  throw new Error("Expected InvalidConversationError.");
}
