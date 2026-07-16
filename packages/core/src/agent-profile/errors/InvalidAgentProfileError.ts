import { AgentProfileError } from "./AgentProfileError.js";

export class InvalidAgentProfileError extends AgentProfileError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const copiedDetails = Object.freeze([...details]);
    super(
      `The agent profile is invalid: ${copiedDetails.join("; ")}.`,
      options,
    );
    this.name = "InvalidAgentProfileError";
    this.details = copiedDetails;
  }
}
