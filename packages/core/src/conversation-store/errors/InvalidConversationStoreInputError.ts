import { ConversationStoreError } from "./ConversationStoreError.js";

export class InvalidConversationStoreInputError extends ConversationStoreError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const copiedDetails = Object.freeze([...details]);
    super(
      `Conversation store input is invalid: ${copiedDetails.join("; ")}.`,
      options,
    );
    this.name = "InvalidConversationStoreInputError";
    this.details = copiedDetails;
  }
}
