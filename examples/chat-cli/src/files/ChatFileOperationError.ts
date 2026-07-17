export class ChatFileOperationError extends Error {
  readonly filePath: string;

  constructor(message: string, filePath: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChatFileOperationError";
    this.filePath = filePath;
  }
}
