import {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_DOCUMENT_VERSION,
  decodeConversationDocument,
  deserializeConversation,
  serializeConversation,
} from "@agentforge/core";
import type { Conversation, ConversationDocumentV2 } from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const createdAt = "2026-01-01T00:00:00.000Z";
const updatedAt = "2026-01-01T00:02:00.000Z";

function conversationWithMessages(): Conversation {
  return {
    id: "conversation-1",
    createdAt,
    updatedAt,
    messages: [
      {
        id: "system-1",
        role: LLMMessageRole.System,
        content: "Answer clearly.",
        createdAt,
      },
      {
        id: "user-1",
        role: LLMMessageRole.User,
        content: 'Unicode: Zażółć 🧪\nQuote: "hello"\\path',
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "assistant-1",
        role: LLMMessageRole.Assistant,
        content: "Got it.",
        createdAt: updatedAt,
      },
    ],
  };
}

function emptyConversation(): Conversation {
  return {
    id: "conversation-1",
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
}

function document(): ConversationDocumentV2 {
  return {
    kind: CONVERSATION_DOCUMENT_KIND,
    version: CONVERSATION_DOCUMENT_VERSION,
    conversation: {
      id: "conversation-1",
      createdAt,
      updatedAt,
      messages: [
        {
          id: "message-1",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt: updatedAt,
        },
      ],
    },
  };
}

describe("conversation serialization", () => {
  it("serializes compact V2 JSON in deterministic property order", () => {
    expect(serializeConversation(emptyConversation())).toBe(
      '{"kind":"agentforge.conversation","version":2,"conversation":{"id":"conversation-1","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","messages":[]}}',
    );
  });

  it("serializes pretty JSON with two spaces and no trailing newline", () => {
    const compact = serializeConversation(conversationWithMessages());
    const pretty = serializeConversation(conversationWithMessages(), {
      pretty: true,
    });

    expect(pretty).toBe(JSON.stringify(JSON.parse(compact), null, 2));
    expect(pretty).not.toMatch(/\n$/u);
  });

  it("is byte-for-byte deterministic regardless of runtime property order", () => {
    const ordered = emptyConversation();
    const reordered = {
      messages: [],
      updatedAt: createdAt,
      createdAt,
      id: "conversation-1",
    } as Conversation;

    expect(serializeConversation(reordered)).toBe(
      serializeConversation(ordered),
    );
    expect(serializeConversation(ordered)).toBe(serializeConversation(ordered));
  });

  it("does not mutate, freeze, or retain mutable runtime input", () => {
    const conversation = conversationWithMessages();
    const messages = conversation.messages as Array<{
      id: string;
      role: LLMMessageRole;
      content: string;
      createdAt: string;
    }>;

    const serialized = serializeConversation(conversation);

    expect(Object.isFrozen(conversation)).toBe(false);
    expect(Object.isFrozen(messages)).toBe(false);
    expect(messages[0]?.content).toBe("Answer clearly.");
    expect(serialized).toContain("Answer clearly.");
  });

  it("round trips an empty conversation", () => {
    const source = emptyConversation();
    const restored = deserializeConversation(serializeConversation(source));

    expect(restored).toEqual(source);
    expect(restored).not.toBe(source);
  });

  it("round trips all current roles, Unicode, multiline text, and escapes", () => {
    const source = conversationWithMessages();
    const restored = deserializeConversation(serializeConversation(source));

    expect(restored).toEqual(source);
    expect(restored.messages.map(({ role }) => role)).toEqual([
      LLMMessageRole.System,
      LLMMessageRole.User,
      LLMMessageRole.Assistant,
    ]);
    expect(restored.messages[1]?.content).toBe(
      'Unicode: Zażółć 🧪\nQuote: "hello"\\path',
    );
  });

  it("decodes parsed documents to deeply frozen snapshots", () => {
    const value = document();
    const decoded = decodeConversationDocument(value);

    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.messages)).toBe(true);
    expect(Object.isFrozen(decoded.messages[0])).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(value.conversation)).toBe(false);
  });

  it("does not retain caller-owned parsed document references", () => {
    const value = document() as unknown as {
      conversation: {
        id: string;
        messages: Array<{ content: string }>;
      };
    };
    const decoded = decodeConversationDocument(value);

    value.conversation.id = "mutated";
    const firstMessage = value.conversation.messages[0];
    if (firstMessage === undefined) throw new Error("Expected a message.");
    firstMessage.content = "mutated";

    expect(decoded.id).toBe("conversation-1");
    expect(decoded.messages[0]?.content).toBe("Hello");
  });

  it("produces equivalent results through decode and deserialize", () => {
    const value = document();

    expect(decodeConversationDocument(value)).toEqual(
      deserializeConversation(JSON.stringify(value)),
    );
  });
});
