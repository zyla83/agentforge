import { ToolContractError } from "./ToolContractError.js";

export class InvalidToolResultError extends ToolContractError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(`Tool result is invalid: ${snapshot.join("; ")}.`, options);
    this.name = "InvalidToolResultError";
    this.details = snapshot;
  }
}
