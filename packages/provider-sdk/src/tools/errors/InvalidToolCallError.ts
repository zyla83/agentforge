import { ToolContractError } from "./ToolContractError.js";

export class InvalidToolCallError extends ToolContractError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(`Tool call is invalid: ${snapshot.join("; ")}.`, options);
    this.name = "InvalidToolCallError";
    this.details = snapshot;
  }
}
