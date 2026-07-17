import type {
  SerializedConversationV1,
  SerializedConversationV2,
} from "./ConversationDocument.js";
import type {
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_1,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_2,
} from "./internal/constants.js";

export interface ConversationStoreEntryDocumentV1 {
  readonly kind: typeof CONVERSATION_STORE_ENTRY_DOCUMENT_KIND;
  readonly version: typeof CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_1;
  readonly entry: {
    readonly conversation: SerializedConversationV1;
    readonly savedAt: string;
    readonly revision: number;
  };
}

export interface ConversationStoreEntryDocumentV2 {
  readonly kind: typeof CONVERSATION_STORE_ENTRY_DOCUMENT_KIND;
  readonly version: typeof CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION_2;
  readonly entry: {
    readonly conversation: SerializedConversationV2;
    readonly savedAt: string;
    readonly revision: number;
  };
}

export type ConversationStoreEntryDocument =
  | ConversationStoreEntryDocumentV1
  | ConversationStoreEntryDocumentV2;
