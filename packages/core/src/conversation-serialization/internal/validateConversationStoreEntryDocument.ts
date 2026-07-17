import { parseIsoTimestamp } from "../../conversation/internal/validation.js";
import type { ConversationStoreEntryDocument } from "../ConversationStoreEntryDocument.js";
import {
  InvalidConversationDocumentError,
  UnsupportedConversationDocumentVersionError,
} from "../errors/index.js";
import {
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_1,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_2,
} from "./constants.js";
import {
  collectUnknownProperties,
  hasOwn,
  isPlainObject,
  validateConversationValue,
} from "./validateConversationDocument.js";

const ENVELOPE_KEYS = new Set(["kind", "version", "entry"]);
const ENTRY_KEYS = new Set(["conversation", "savedAt", "revision"]);

export function validateConversationStoreEntryDocument(
  value: unknown,
): ConversationStoreEntryDocument {
  try {
    if (!isPlainObject(value)) {
      throw new InvalidConversationDocumentError([
        "document must be a plain object",
      ]);
    }

    const details: string[] = [];
    collectUnknownProperties(value, ENVELOPE_KEYS, "", details);
    if (!hasOwn(value, "kind")) {
      details.push("kind is required");
    } else if (value.kind !== CONVERSATION_STORE_ENTRY_DOCUMENT_KIND) {
      details.push(
        `kind must equal "${CONVERSATION_STORE_ENTRY_DOCUMENT_KIND}"`,
      );
    }

    let version: number | undefined;
    if (!hasOwn(value, "version")) {
      details.push("version is required");
    } else if (
      typeof value.version !== "number" ||
      !Number.isFinite(value.version) ||
      !Number.isInteger(value.version) ||
      value.version <= 0
    ) {
      details.push("version must be a positive integer");
    } else {
      version = value.version;
    }

    if (
      details.length === 0 &&
      version !== undefined &&
      version !== CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_1 &&
      version !== CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_2
    ) {
      throw new UnsupportedConversationDocumentVersionError(
        CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
        version,
        [
          CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_1,
          CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_2,
        ],
      );
    }

    if (!hasOwn(value, "entry")) {
      details.push("entry is required");
    } else {
      validateEntry(
        value.entry,
        details,
        version ?? CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_2,
      );
    }

    if (details.length > 0) throw new InvalidConversationDocumentError(details);
    return value as unknown as ConversationStoreEntryDocument;
  } catch (error) {
    if (
      error instanceof InvalidConversationDocumentError ||
      error instanceof UnsupportedConversationDocumentVersionError
    ) {
      throw error;
    }
    throw new InvalidConversationDocumentError(
      ["document could not be inspected safely"],
      { cause: error },
    );
  }
}

function validateEntry(
  value: unknown,
  details: string[],
  version: number,
): void {
  if (!isPlainObject(value)) {
    details.push("entry must be a plain object");
    return;
  }
  collectUnknownProperties(value, ENTRY_KEYS, "entry", details);
  if (!hasOwn(value, "conversation")) {
    details.push("entry.conversation is required");
  } else {
    validateConversationValue(
      value.conversation,
      "entry.conversation",
      details,
      version,
    );
  }
  if (!hasOwn(value, "savedAt")) {
    details.push("entry.savedAt is required");
  } else if (parseIsoTimestamp(value.savedAt) === undefined) {
    details.push("entry.savedAt must be a valid ISO 8601 timestamp");
  }
  if (!hasOwn(value, "revision")) {
    details.push("entry.revision is required");
  } else if (
    typeof value.revision !== "number" ||
    !Number.isFinite(value.revision) ||
    !Number.isInteger(value.revision) ||
    value.revision <= 0
  ) {
    details.push("entry.revision must be a positive integer");
  }
}
