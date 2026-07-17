import {
  CONVERSATION_DOCUMENT_VERSION,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
  appendConversationMessage,
  conversationToLLMMessages,
  createConversation,
  deserializeConversation,
  deserializeConversationStoreEntry,
  serializeConversation,
  serializeConversationStoreEntry,
} from "@agentforge/core";
import {
  LLMMessageRole,
  failedToolResult,
  successfulToolResult,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function toolConversation(failure = false) {
  let sequence = 0;
  const options = {
    idGenerator: () => `message-${++sequence}`,
    now: () => new Date(`2026-07-17T10:00:0${sequence}.000Z`),
  };
  const call = {
    id: "wezwanie-1",
    name: "pogoda",
    arguments: { miasto: "Łódź 👋" },
  };
  const result = failure
    ? failedToolResult(call, {
        code: "weather_failed",
        message: "Weather failed.",
        details: { retryable: false },
      })
    : successfulToolResult(call, { temperatura: 21, opis: "słońce ☀️" });
  let conversation = createConversation({
    id: "conversation-tools",
    createdAt: "2026-07-17T10:00:00.000Z",
  });
  conversation = appendConversationMessage(
    conversation,
    { role: LLMMessageRole.Assistant, content: "", toolCalls: [call] },
    options,
  );
  conversation = appendConversationMessage(
    conversation,
    {
      role: LLMMessageRole.Tool,
      content: JSON.stringify(result),
      toolCallId: call.id,
      toolName: call.name,
      result,
    },
    options,
  );
  return conversation;
}

describe("conversation serialization V2", () => {
  it.each([false, true])(
    "round trips immutable tool history (failure=%s)",
    (failure) => {
      const source = toolConversation(failure);
      const serialized = serializeConversation(source);
      const parsed = JSON.parse(serialized);
      const restored = deserializeConversation(serialized);
      expect(parsed.version).toBe(2);
      expect(restored).toEqual(source);
      expect(Object.isFrozen(restored)).toBe(true);
      expect(Object.isFrozen(restored.messages)).toBe(true);
      expect(Object.isFrozen(restored.messages[0])).toBe(true);
      expect(
        Object.isFrozen(
          (restored.messages[0] as { toolCalls: unknown }).toolCalls,
        ),
      ).toBe(true);
      expect(
        Object.isFrozen((restored.messages[1] as { result: unknown }).result),
      ).toBe(true);
    },
  );

  it("writes V2 store entries and restores tool conversations", () => {
    const serialized = serializeConversationStoreEntry({
      conversation: toolConversation(),
      savedAt: "2026-07-17T11:00:00.000Z",
      revision: 2,
    });
    const restored = deserializeConversationStoreEntry(serialized);
    expect(JSON.parse(serialized).version).toBe(2);
    expect(restored.conversation.messages).toHaveLength(2);
    expect(Object.isFrozen(restored)).toBe(true);
  });

  it("preserves structured calls and results in provider messages", () => {
    const messages = conversationToLLMMessages(toolConversation());
    expect(messages[0]).toMatchObject({
      role: LLMMessageRole.Assistant,
      toolCalls: [{ id: "wezwanie-1", name: "pogoda" }],
    });
    expect(messages[1]).toMatchObject({
      role: LLMMessageRole.Tool,
      toolCallId: "wezwanie-1",
      toolName: "pogoda",
      result: { status: "success" },
    });
    expect(Object.isFrozen(messages)).toBe(true);
  });

  it("exposes version 2 as the current serialization version", () => {
    expect(CONVERSATION_DOCUMENT_VERSION).toBe(2);
    expect(CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION).toBe(2);
  });
});
