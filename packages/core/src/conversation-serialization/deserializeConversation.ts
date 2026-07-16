import type { Conversation } from "../conversation/index.js";
import { decodeConversationDocument } from "./decodeConversationDocument.js";
import {
  ConversationSerializationSyntaxError,
  InvalidConversationDocumentError,
} from "./errors/index.js";

export function deserializeConversation(
  serialized: string,
): Readonly<Conversation> {
  return decodeConversationDocument(parseSerializedConversation(serialized));
}

export function parseSerializedConversation(serialized: string): unknown {
  if (typeof serialized !== "string") {
    throw new InvalidConversationDocumentError([
      "serialized value must be a string",
    ]);
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new ConversationSerializationSyntaxError(undefined, { cause: error });
  }
}
