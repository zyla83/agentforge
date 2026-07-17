export class ChatCommandParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChatCommandParseError";
  }
}
