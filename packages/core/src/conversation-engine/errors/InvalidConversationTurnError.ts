import { ConversationEngineError } from "./ConversationEngineError.js";

export class InvalidConversationTurnError extends ConversationEngineError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const copiedDetails = Object.freeze([...details]);
    super(
      `The conversation turn is invalid: ${copiedDetails.join("; ")}.`,
      options,
    );
    this.name = "InvalidConversationTurnError";
    this.details = copiedDetails;
  }
}
