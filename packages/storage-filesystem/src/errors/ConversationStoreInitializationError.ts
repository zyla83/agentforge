import { FilesystemConversationStoreError } from "./FilesystemConversationStoreError.js";

export class ConversationStoreInitializationError extends FilesystemConversationStoreError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConversationStoreInitializationError";
  }
}
