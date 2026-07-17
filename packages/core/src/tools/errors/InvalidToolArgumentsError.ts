import { ToolExecutionError } from "./ToolExecutionError.js";

export class InvalidToolArgumentsError extends ToolExecutionError {
  readonly toolName: string;
  readonly details: readonly string[];

  constructor(
    toolName: string,
    details: readonly string[],
    options?: ErrorOptions,
  ) {
    const snapshot = Object.freeze([...details]);
    super(
      `Arguments for tool "${toolName}" are invalid: ${snapshot.join("; ")}.`,
      options,
    );
    this.name = "InvalidToolArgumentsError";
    this.toolName = toolName;
    this.details = snapshot;
  }
}
