import type { ConversationStoreEntry } from "../conversation-store/index.js";
import { InvalidConversationDocumentError } from "./errors/index.js";
import { snapshotDecodedConversation } from "./internal/snapshotDecodedConversation.js";
import { validateConversationStoreEntryDocument } from "./internal/validateConversationStoreEntryDocument.js";

export function decodeConversationStoreEntryDocument(
  value: unknown,
): Readonly<ConversationStoreEntry> {
  const document = validateConversationStoreEntryDocument(value);
  try {
    return Object.freeze({
      conversation: snapshotDecodedConversation(document.entry.conversation),
      savedAt: document.entry.savedAt,
      revision: document.entry.revision,
    });
  } catch (error) {
    if (error instanceof InvalidConversationDocumentError) throw error;
    throw new InvalidConversationDocumentError(
      ["entry could not be snapshotted safely"],
      { cause: error },
    );
  }
}
