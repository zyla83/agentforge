import type {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_DOCUMENT_VERSION,
} from "./internal/constants.js";

export interface ConversationDocumentV1 {
  readonly kind: typeof CONVERSATION_DOCUMENT_KIND;
  readonly version: typeof CONVERSATION_DOCUMENT_VERSION;
  readonly conversation: {
    readonly id: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly messages: readonly {
      readonly id: string;
      readonly role: string;
      readonly content: string;
      readonly createdAt: string;
    }[];
  };
}

export type ConversationDocument = ConversationDocumentV1;
