import {
  InvalidConversationError,
  conversationToLLMMessages,
  createConversation,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const timestamp = "2026-07-15T12:00:00.000Z";

describe("conversationToLLMMessages", () => {
  it("returns a frozen empty array for an empty conversation", () => {
    const messages = conversationToLLMMessages(
      createConversation({ id: "conversation", createdAt: timestamp }),
    );

    expect(messages).toEqual([]);
    expect(Object.isFrozen(messages)).toBe(true);
  });

  it("creates fresh frozen provider messages in conversation order", () => {
    const conversation = createConversation({
      id: "conversation",
      createdAt: timestamp,
      messages: [
        {
          id: "system",
          role: LLMMessageRole.System,
          content: "  Preserve this exactly  ",
          createdAt: timestamp,
        },
        {
          id: "user",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: timestamp,
        },
        {
          id: "assistant",
          role: LLMMessageRole.Assistant,
          content: "Hello!",
          createdAt: timestamp,
        },
      ],
    });

    const messages = conversationToLLMMessages(conversation);

    expect(messages).toEqual([
      { role: LLMMessageRole.System, content: "  Preserve this exactly  " },
      { role: LLMMessageRole.User, content: "Hello" },
      { role: LLMMessageRole.Assistant, content: "Hello!" },
    ]);
    expect(messages[0]).not.toBe(conversation.messages[0]);
    expect(messages.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(messages)).toBe(true);
    expect(messages[0]).not.toHaveProperty("id");
    expect(messages[0]).not.toHaveProperty("createdAt");
  });

  it("returns fresh arrays and objects on repeated conversion", () => {
    const conversation = createConversation({
      id: "conversation",
      createdAt: timestamp,
      messages: [
        {
          id: "message",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: timestamp,
        },
      ],
    });

    const first = conversationToLLMMessages(conversation);
    const second = conversationToLLMMessages(conversation);

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });

  it("rejects malformed conversations", () => {
    expect(() => conversationToLLMMessages(null as never)).toThrow(
      InvalidConversationError,
    );
  });
});
