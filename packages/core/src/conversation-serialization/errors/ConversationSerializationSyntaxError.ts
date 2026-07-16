import { ConversationSerializationError } from "./ConversationSerializationError.js";

export class ConversationSerializationSyntaxError extends ConversationSerializationError {
  constructor(
    message = "Serialized conversation JSON is invalid.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ConversationSerializationSyntaxError";
  }
}
