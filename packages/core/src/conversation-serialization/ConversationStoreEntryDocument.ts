import type { ConversationDocumentV1 } from "./ConversationDocument.js";
import type {
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
} from "./internal/constants.js";

export interface ConversationStoreEntryDocumentV1 {
  readonly kind: typeof CONVERSATION_STORE_ENTRY_DOCUMENT_KIND;
  readonly version: typeof CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION;
  readonly entry: {
    readonly conversation: ConversationDocumentV1["conversation"];
    readonly savedAt: string;
    readonly revision: number;
  };
}

export type ConversationStoreEntryDocument = ConversationStoreEntryDocumentV1;
