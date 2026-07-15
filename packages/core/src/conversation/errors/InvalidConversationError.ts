import { ConversationError } from "./ConversationError.js";

export class InvalidConversationError extends ConversationError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const copiedDetails = Object.freeze([...details]);
    super(`The conversation is invalid: ${copiedDetails.join("; ")}.`, options);
    this.name = "InvalidConversationError";
    this.details = copiedDetails;
  }
}
