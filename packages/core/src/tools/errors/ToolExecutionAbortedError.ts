import { ToolExecutionError } from "./ToolExecutionError.js";

export enum ToolExecutionPhase {
  Resolution = "tool-resolution",
  ArgumentValidation = "tool-argument-validation",
  Execution = "tool-execution",
  Result = "tool-result",
}

export class ToolExecutionAbortedError extends ToolExecutionError {
  readonly phase: ToolExecutionPhase;
  readonly reason: unknown;

  constructor(phase: ToolExecutionPhase, reason?: unknown) {
    super(
      `Tool execution was aborted during ${phase}.`,
      reason === undefined ? undefined : { cause: reason },
    );
    this.name = "ToolExecutionAbortedError";
    this.phase = phase;
    this.reason = reason;
  }
}
