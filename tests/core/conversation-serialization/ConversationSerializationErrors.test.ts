import {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  ConversationSerializationError,
  ConversationSerializationSyntaxError,
  InvalidConversationDocumentError,
  UnsupportedConversationDocumentVersionError,
  decodeConversationDocument,
  decodeConversationStoreEntryDocument,
  deserializeConversation,
  deserializeConversationStoreEntry,
  serializeConversation,
  serializeConversationStoreEntry,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const timestamp = "2026-01-01T00:00:00.000Z";

function validConversationDocument(): Record<string, unknown> {
  return {
    kind: CONVERSATION_DOCUMENT_KIND,
    version: 1,
    conversation: {
      id: "conversation-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
    },
  };
}

function validStoreDocument(): Record<string, unknown> {
  return {
    kind: CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
    version: 1,
    entry: {
      conversation: {
        id: "conversation-1",
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [],
      },
      savedAt: timestamp,
      revision: 1,
    },
  };
}

describe("conversation serialization syntax errors", () => {
  it.each(["", "{", "{]", "not-json"])(
    "maps malformed conversation JSON %#",
    (serialized) => {
      expect(() => deserializeConversation(serialized)).toThrowError(
        expect.objectContaining({
          name: "ConversationSerializationSyntaxError",
          cause: expect.any(SyntaxError),
        }),
      );
    },
  );

  it.each(["", "{", "{]", "not-json"])(
    "maps malformed store-entry JSON %#",
    (serialized) => {
      expect(() => deserializeConversationStoreEntry(serialized)).toThrowError(
        expect.objectContaining({
          name: "ConversationSerializationSyntaxError",
          cause: expect.any(SyntaxError),
        }),
      );
    },
  );

  it("uses the serialization error hierarchy", () => {
    const error = new ConversationSerializationSyntaxError();

    expect(error).toBeInstanceOf(ConversationSerializationError);
    expect(error.message).toBe("Serialized conversation JSON is invalid.");
  });

  it("treats valid JSON with invalid structure as a document error", () => {
    expect(() => deserializeConversation("null")).toThrow(
      InvalidConversationDocumentError,
    );
    expect(() => deserializeConversation("null")).not.toThrow(
      ConversationSerializationSyntaxError,
    );
  });
});

describe("conversation document validation", () => {
  it.each([null, [], "value", 42])(
    "rejects non-object document %#",
    (value) => {
      expect(() => decodeConversationDocument(value)).toThrow(
        InvalidConversationDocumentError,
      );
    },
  );

  it("wraps property inspection failures from runtime values", () => {
    const cause = new Error("inspection failed");
    const value = new Proxy(
      {},
      {
        ownKeys() {
          throw cause;
        },
      },
    );

    expect(() => decodeConversationDocument(value)).toThrowError(
      expect.objectContaining({
        name: "InvalidConversationDocumentError",
        cause,
      }),
    );
  });

  it.each([
    ["missing kind", { version: 1, conversation: {} }, "kind is required"],
    [
      "wrong kind",
      {
        ...validConversationDocument(),
        kind: CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
      },
      `kind must equal "${CONVERSATION_DOCUMENT_KIND}"`,
    ],
    [
      "missing version",
      { kind: CONVERSATION_DOCUMENT_KIND },
      "version is required",
    ],
    [
      "string version",
      { ...validConversationDocument(), version: "1" },
      "version must be a positive integer",
    ],
    [
      "zero version",
      { ...validConversationDocument(), version: 0 },
      "version must be a positive integer",
    ],
    [
      "negative version",
      { ...validConversationDocument(), version: -1 },
      "version must be a positive integer",
    ],
    [
      "fractional version",
      { ...validConversationDocument(), version: 1.5 },
      "version must be a positive integer",
    ],
    [
      "missing conversation",
      { kind: CONVERSATION_DOCUMENT_KIND, version: 1 },
      "conversation is required",
    ],
    [
      "null conversation",
      { ...validConversationDocument(), conversation: null },
      "conversation must be a plain object",
    ],
  ])("rejects %s", (_name, value, detail) => {
    expect(() => decodeConversationDocument(value)).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([detail]) }),
    );
  });

  it.each([
    ["id", undefined, "conversation.id is required"],
    ["id", "", "conversation.id must be a non-empty string"],
    ["createdAt", undefined, "conversation.createdAt is required"],
    [
      "createdAt",
      "invalid",
      "conversation.createdAt must be a valid ISO 8601 timestamp",
    ],
    ["updatedAt", undefined, "conversation.updatedAt is required"],
    [
      "updatedAt",
      "invalid",
      "conversation.updatedAt must be a valid ISO 8601 timestamp",
    ],
    ["messages", undefined, "conversation.messages is required"],
    ["messages", null, "conversation.messages must be an array"],
  ])("rejects invalid conversation field %s=%#", (key, value, detail) => {
    const document = validConversationDocument();
    const conversation = document.conversation as Record<string, unknown>;
    if (value === undefined) delete conversation[key];
    else conversation[key] = value;

    expect(() => decodeConversationDocument(document)).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([detail]) }),
    );
  });

  it.each([
    [null, "conversation.messages[0] must be a plain object"],
    [
      { id: "message", role: "User", content: "Hello", createdAt: timestamp },
      "conversation.messages[0].role must be a valid LLMMessageRole",
    ],
    [
      { id: "message", role: LLMMessageRole.User, content: "Hello" },
      "conversation.messages[0].createdAt is required",
    ],
  ])("rejects malformed message %#", (message, detail) => {
    const document = validConversationDocument();
    (document.conversation as Record<string, unknown>).messages = [message];

    expect(() => decodeConversationDocument(document)).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([detail]) }),
    );
  });

  it.each([
    [
      "top-level",
      { ...validConversationDocument(), extra: true },
      "extra is not supported",
    ],
    [
      "conversation",
      {
        ...validConversationDocument(),
        conversation: {
          ...(validConversationDocument().conversation as object),
          extra: true,
        },
      },
      "conversation.extra is not supported",
    ],
    [
      "message",
      {
        ...validConversationDocument(),
        conversation: {
          ...(validConversationDocument().conversation as object),
          updatedAt: timestamp,
          messages: [
            {
              id: "message",
              role: LLMMessageRole.User,
              content: "Hello",
              createdAt: timestamp,
              metadata: {},
            },
          ],
        },
      },
      "conversation.messages[0].metadata is not supported",
    ],
  ])("rejects unknown %s properties", (_name, value, detail) => {
    expect(() => decodeConversationDocument(value)).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([detail]) }),
    );
  });

  it("wraps authoritative runtime chronology validation", () => {
    const document = validConversationDocument();
    (document.conversation as Record<string, unknown>).createdAt =
      "2026-01-02T00:00:00.000Z";

    expect(() => decodeConversationDocument(document)).toThrowError(
      expect.objectContaining({
        name: "InvalidConversationDocumentError",
        cause: expect.any(Error),
      }),
    );
  });

  it("returns the same document error class through decode and deserialize", () => {
    const value = { kind: CONVERSATION_DOCUMENT_KIND, version: 1 };

    expect(() => decodeConversationDocument(value)).toThrow(
      InvalidConversationDocumentError,
    );
    expect(() => deserializeConversation(JSON.stringify(value))).toThrow(
      InvalidConversationDocumentError,
    );
  });
});

describe("store-entry document validation", () => {
  it.each([
    [
      "missing entry",
      { kind: CONVERSATION_STORE_ENTRY_DOCUMENT_KIND, version: 1 },
      "entry is required",
    ],
    [
      "null entry",
      { ...validStoreDocument(), entry: null },
      "entry must be a plain object",
    ],
  ])("rejects %s", (_name, value, detail) => {
    expect(() => decodeConversationStoreEntryDocument(value)).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([detail]) }),
    );
  });

  it.each([
    ["savedAt", undefined, "entry.savedAt is required"],
    ["savedAt", "invalid", "entry.savedAt must be a valid ISO 8601 timestamp"],
    ["revision", undefined, "entry.revision is required"],
    ["revision", 0, "entry.revision must be a positive integer"],
    ["revision", -1, "entry.revision must be a positive integer"],
    ["revision", 1.5, "entry.revision must be a positive integer"],
  ])("rejects invalid entry %s=%#", (key, value, detail) => {
    const document = validStoreDocument();
    const entry = document.entry as Record<string, unknown>;
    if (value === undefined) delete entry[key];
    else entry[key] = value;

    expect(() => decodeConversationStoreEntryDocument(document)).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([detail]) }),
    );
  });

  it("rejects unknown entry properties", () => {
    const document = validStoreDocument();
    (document.entry as Record<string, unknown>).extra = true;

    expect(() => decodeConversationStoreEntryDocument(document)).toThrowError(
      expect.objectContaining({
        details: ["entry.extra is not supported"],
      }),
    );
  });
});

describe("unsupported conversation document versions", () => {
  it.each([
    [
      CONVERSATION_DOCUMENT_KIND,
      3,
      decodeConversationDocument,
      validConversationDocument,
    ],
    [
      CONVERSATION_DOCUMENT_KIND,
      999,
      decodeConversationDocument,
      validConversationDocument,
    ],
    [
      CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
      3,
      decodeConversationStoreEntryDocument,
      validStoreDocument,
    ],
  ])("rejects %s version %i", (kind, version, decode, createDocument) => {
    const document = createDocument();
    document.version = version;

    try {
      decode(document);
      throw new Error("Expected decoding to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedConversationDocumentVersionError);
      expect(error).toMatchObject({
        documentKind: kind,
        version,
        supportedVersions: [1, 2],
      });
      expect(
        Object.isFrozen(
          (error as UnsupportedConversationDocumentVersionError)
            .supportedVersions,
        ),
      ).toBe(true);
    }
  });
});

describe("serialization input validation", () => {
  it("rejects invalid runtime conversations", () => {
    expect(() => serializeConversation({ id: "" } as never)).toThrow(
      InvalidConversationDocumentError,
    );
  });

  it("rejects invalid serialization options", () => {
    const conversation = (validConversationDocument().conversation ??
      {}) as never;

    expect(() => serializeConversation(conversation, null as never)).toThrow(
      InvalidConversationDocumentError,
    );
    expect(() =>
      serializeConversation(conversation, { pretty: "yes" as never }),
    ).toThrow(InvalidConversationDocumentError);
  });

  it("rejects invalid runtime store metadata", () => {
    const conversation = validConversationDocument().conversation as never;

    expect(() =>
      serializeConversationStoreEntry({
        conversation,
        savedAt: "invalid",
        revision: 0,
      }),
    ).toThrowError(
      expect.objectContaining({
        details: [
          "entry.savedAt must be a valid ISO 8601 timestamp",
          "entry.revision must be a positive integer",
        ],
      }),
    );
  });
});
