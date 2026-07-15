import {
  InvalidConversationError,
  createConversation,
  serializeConversation,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const timestamp = "2026-07-15T12:00:00.000Z";

describe("serializeConversation", () => {
  it("serializes an empty conversation to a fresh frozen plain object", () => {
    const conversation = createConversation({
      id: "conversation",
      createdAt: timestamp,
    });
    const serialized = serializeConversation(conversation);

    expect(serialized).toEqual({
      id: "conversation",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
    });
    expect(serialized).not.toBe(conversation);
    expect(serialized.messages).not.toBe(conversation.messages);
    expect(Object.isFrozen(serialized)).toBe(true);
    expect(Object.isFrozen(serialized.messages)).toBe(true);
  });

  it("preserves all fields and serializes roles as strings", () => {
    const conversation = createConversation({
      id: "conversation",
      createdAt: timestamp,
      messages: [
        {
          id: "message",
          role: LLMMessageRole.Assistant,
          content: "Hello!",
          createdAt: "2026-07-15T12:01:00.000Z",
        },
      ],
    });

    const serialized = serializeConversation(conversation);

    expect(serialized).toEqual({
      id: "conversation",
      createdAt: timestamp,
      updatedAt: "2026-07-15T12:01:00.000Z",
      messages: [
        {
          id: "message",
          role: "assistant",
          content: "Hello!",
          createdAt: "2026-07-15T12:01:00.000Z",
        },
      ],
    });
    expect(serialized.messages[0]).not.toBe(conversation.messages[0]);
    expect(Object.isFrozen(serialized.messages[0])).toBe(true);
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it("returns fresh serialized snapshots", () => {
    const conversation = createConversation({
      id: "conversation",
      createdAt: timestamp,
    });

    const first = serializeConversation(conversation);
    const second = serializeConversation(conversation);

    expect(first).not.toBe(second);
    expect(first.messages).not.toBe(second.messages);
  });

  it("rejects malformed conversations", () => {
    expect(() => serializeConversation([] as never)).toThrow(
      InvalidConversationError,
    );
  });
});
