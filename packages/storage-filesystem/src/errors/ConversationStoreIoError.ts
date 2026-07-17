import { FilesystemConversationStoreError } from "./FilesystemConversationStoreError.js";

export class ConversationStoreIoError extends FilesystemConversationStoreError {
  readonly operation: string;
  readonly filePath: string | undefined;
  readonly code: string | undefined;

  constructor(operation: string, filePath?: string, options?: ErrorOptions) {
    super(
      filePath === undefined
        ? `Conversation store I/O operation "${operation}" failed.`
        : `Conversation store I/O operation "${operation}" failed for "${filePath}".`,
      options,
    );
    this.name = "ConversationStoreIoError";
    this.operation = operation;
    this.filePath = filePath;
    this.code = getErrorCode(options?.cause);
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}
