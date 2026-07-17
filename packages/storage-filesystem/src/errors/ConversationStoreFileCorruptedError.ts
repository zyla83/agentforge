import { FilesystemConversationStoreError } from "./FilesystemConversationStoreError.js";

export class ConversationStoreFileCorruptedError extends FilesystemConversationStoreError {
  readonly filePath: string;
  readonly conversationId: string | undefined;

  constructor(
    filePath: string,
    conversationId?: string,
    options?: ErrorOptions,
  ) {
    super(`Conversation store file "${filePath}" is corrupted.`, options);
    this.name = "ConversationStoreFileCorruptedError";
    this.filePath = filePath;
    this.conversationId = conversationId;
  }
}
