import type { ConversationStoreEntry } from "../conversation-store/index.js";
import { parseIsoTimestamp } from "../conversation/internal/validation.js";
import type { ConversationSerializationOptions } from "./ConversationSerializationOptions.js";
import type { ConversationStoreEntryDocumentV2 } from "./ConversationStoreEntryDocument.js";
import { InvalidConversationDocumentError } from "./errors/index.js";
import {
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
} from "./internal/constants.js";
import { buildSerializedConversationValue } from "./internal/snapshotDecodedConversation.js";
import { isPlainObject } from "./internal/validateConversationDocument.js";
import { stringifyConversationDocument } from "./serializeConversation.js";

export function serializeConversationStoreEntry(
  entry: ConversationStoreEntry,
  options?: ConversationSerializationOptions,
): string {
  return stringifyConversationDocument(buildStoreEntryDocument(entry), options);
}

function buildStoreEntryDocument(
  entry: ConversationStoreEntry,
): ConversationStoreEntryDocumentV2 {
  if (!isPlainObject(entry)) {
    throw new InvalidConversationDocumentError([
      "entry must be a plain object",
    ]);
  }
  const details: string[] = [];
  if (parseIsoTimestamp(entry.savedAt) === undefined) {
    details.push("entry.savedAt must be a valid ISO 8601 timestamp");
  }
  if (
    typeof entry.revision !== "number" ||
    !Number.isFinite(entry.revision) ||
    !Number.isInteger(entry.revision) ||
    entry.revision <= 0
  ) {
    details.push("entry.revision must be a positive integer");
  }
  if (details.length > 0) throw new InvalidConversationDocumentError(details);

  return {
    kind: CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
    version: CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
    entry: {
      conversation: buildSerializedConversationValue(entry.conversation),
      savedAt: entry.savedAt,
      revision: entry.revision,
    },
  };
}
