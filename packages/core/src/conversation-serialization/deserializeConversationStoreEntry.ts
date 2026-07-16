import type { ConversationStoreEntry } from "../conversation-store/index.js";
import { decodeConversationStoreEntryDocument } from "./decodeConversationStoreEntryDocument.js";
import { parseSerializedConversation } from "./deserializeConversation.js";

export function deserializeConversationStoreEntry(
  serialized: string,
): Readonly<ConversationStoreEntry> {
  return decodeConversationStoreEntryDocument(
    parseSerializedConversation(serialized),
  );
}
