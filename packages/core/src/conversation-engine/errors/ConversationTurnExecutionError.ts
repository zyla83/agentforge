import { ConversationEngineError } from "./ConversationEngineError.js";

export enum ConversationTurnExecutionPhase {
  Validation = "validation",
  ProviderResolution = "provider-resolution",
  UserAppend = "user-append",
  ProviderExecution = "provider-execution",
  AssistantAppend = "assistant-append",
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
