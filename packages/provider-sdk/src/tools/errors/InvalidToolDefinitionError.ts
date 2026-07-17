import { ToolContractError } from "./ToolContractError.js";

export class InvalidToolDefinitionError extends ToolContractError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(`Tool definition is invalid: ${snapshot.join("; ")}.`, options);
    this.name = "InvalidToolDefinitionError";
    this.details = snapshot;
  }
}
