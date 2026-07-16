import { ConversationStoreError } from "./ConversationStoreError.js";

export class ConversationNotFoundError extends ConversationStoreError {
  readonly conversationId: string;

  constructor(conversationId: string, options?: ErrorOptions) {
    super(`Conversation "${conversationId}" was not found.`, options);
    this.name = "ConversationNotFoundError";
    this.conversationId = conversationId;
  }
}
