import { ConversationSerializationError } from "./ConversationSerializationError.js";

export class InvalidConversationDocumentError extends ConversationSerializationError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const copiedDetails = Object.freeze([...details]);
    super(
      `Conversation document is invalid: ${copiedDetails.join("; ")}.`,
      options,
    );
    this.name = "InvalidConversationDocumentError";
    this.details = copiedDetails;
  }
}
