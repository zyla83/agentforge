import {
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
  decodeConversationStoreEntryDocument,
  deserializeConversationStoreEntry,
  serializeConversationStoreEntry,
} from "@agentforge/core";
import type {
  ConversationStoreEntry,
  ConversationStoreEntryDocumentV2,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const createdAt = "2026-01-01T00:00:00.000Z";
const savedAt = "2026-01-01T01:00:00.000Z";

function entry(): ConversationStoreEntry {
  return {
    conversation: {
      id: "conversation-1",
      createdAt,
      updatedAt: createdAt,
      messages: [
        {
          id: "message-1",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt,
        },
      ],
    },
    savedAt,
    revision: 7,
  };
}

function document(): ConversationStoreEntryDocumentV2 {
  return {
    kind: CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
    version: CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
    entry: {
      conversation: {
        id: "conversation-1",
        createdAt,
        updatedAt: createdAt,
        messages: [
          {
            id: "message-1",
            role: LLMMessageRole.User,
            content: "Hello",
            createdAt,
          },
        ],
      },
      savedAt,
      revision: 7,
    },
  };
}

describe("conversation store entry serialization", () => {
  it("serializes compact JSON in exact property order", () => {
    expect(serializeConversationStoreEntry(entry())).toBe(
      '{"kind":"agentforge.conversation-store-entry","version":2,"entry":{"conversation":{"id":"conversation-1","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","messages":[{"id":"message-1","role":"user","content":"Hello","createdAt":"2026-01-01T00:00:00.000Z"}]},"savedAt":"2026-01-01T01:00:00.000Z","revision":7}}',
    );
  });

  it("supports pretty output without a trailing newline", () => {
    const compact = serializeConversationStoreEntry(entry());
    const pretty = serializeConversationStoreEntry(entry(), { pretty: true });

    expect(pretty).toBe(JSON.stringify(JSON.parse(compact), null, 2));
    expect(pretty).not.toMatch(/\n$/u);
  });

  it("round trips savedAt, revision, and the nested conversation", () => {
    const source = entry();
    const restored = deserializeConversationStoreEntry(
      serializeConversationStoreEntry(source),
    );

    expect(restored).toEqual(source);
    expect(restored.savedAt).toBe(savedAt);
    expect(restored.revision).toBe(7);
  });

  it("does not mutate or freeze runtime input", () => {
    const source = entry();

    serializeConversationStoreEntry(source);

    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.conversation)).toBe(false);
  });

  it("decodes to a deeply frozen entry without freezing parsed input", () => {
    const value = document();
    const decoded = decodeConversationStoreEntryDocument(value);

    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.conversation)).toBe(true);
    expect(Object.isFrozen(decoded.conversation.messages)).toBe(true);
    expect(Object.isFrozen(decoded.conversation.messages[0])).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(value.entry)).toBe(false);
  });

  it("does not retain parsed document references", () => {
    const value = document() as unknown as {
      entry: {
        revision: number;
        conversation: { id: string };
      };
    };
    const decoded = decodeConversationStoreEntryDocument(value);

    value.entry.revision = 99;
    value.entry.conversation.id = "mutated";

    expect(decoded.revision).toBe(7);
    expect(decoded.conversation.id).toBe("conversation-1");
  });
});
