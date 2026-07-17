import { ConversationStoreError } from "@agentforge/core";

export class FilesystemConversationStoreError extends ConversationStoreError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FilesystemConversationStoreError";
  }
}
