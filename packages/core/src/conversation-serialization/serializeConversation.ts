import type { Conversation } from "../conversation/index.js";
import type { ConversationDocumentV1 } from "./ConversationDocument.js";
import type { ConversationSerializationOptions } from "./ConversationSerializationOptions.js";
import { InvalidConversationDocumentError } from "./errors/index.js";
import {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_DOCUMENT_VERSION,
} from "./internal/constants.js";
import { buildSerializedConversationValue } from "./internal/snapshotDecodedConversation.js";
import { isPlainObject } from "./internal/validateConversationDocument.js";

export function serializeConversation(
  conversation: Conversation,
  options?: ConversationSerializationOptions,
): string {
  return stringifyConversationDocument(
    buildConversationDocument(conversation),
    options,
  );
}

export function buildConversationDocument(
  conversation: Conversation,
): ConversationDocumentV1 {
  return {
    kind: CONVERSATION_DOCUMENT_KIND,
    version: CONVERSATION_DOCUMENT_VERSION,
    conversation: buildSerializedConversationValue(conversation),
  };
}

export function stringifyConversationDocument(
  document: unknown,
  options: ConversationSerializationOptions | undefined,
): string {
  const pretty = validateSerializationOptions(options);
  return JSON.stringify(document, null, pretty ? 2 : undefined);
}

function validateSerializationOptions(
  options: ConversationSerializationOptions | undefined,
): boolean {
  if (options === undefined) return false;
  if (!isPlainObject(options)) {
    throw new InvalidConversationDocumentError([
      "options must be a plain object when provided",
    ]);
  }
  if (options.pretty !== undefined && typeof options.pretty !== "boolean") {
    throw new InvalidConversationDocumentError([
      "options.pretty must be a boolean when provided",
    ]);
  }
  return options.pretty ?? false;
}
