import { ConversationError } from "./ConversationError.js";

export class InvalidConversationMessageError extends ConversationError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const copiedDetails = Object.freeze([...details]);
    super(
      `The conversation message is invalid: ${copiedDetails.join("; ")}.`,
      options,
    );
    this.name = "InvalidConversationMessageError";
    this.details = copiedDetails;
  }
}
