import { ConversationEngineError } from "./ConversationEngineError.js";

export enum ConversationTurnExecutionPhase {
  Validation = "validation",
  ProviderResolution = "provider-resolution",
  UserAppend = "user-append",
  ProviderExecution = "provider-execution",
  AssistantAppend = "assistant-append",
  ToolResolution = "tool-resolution",
  ToolArgumentValidation = "tool-argument-validation",
  ToolExecution = "tool-execution",
  ToolResultAppend = "tool-result-append",
  ToolLoop = "tool-loop",
  Completed = "completed",
}

export class ConversationTurnExecutionError extends ConversationEngineError {
  readonly phase: ConversationTurnExecutionPhase;

  constructor(
    phase: ConversationTurnExecutionPhase,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ConversationTurnExecutionError";
    this.phase = phase;
  }
}
