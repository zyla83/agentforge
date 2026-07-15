export enum LLMMessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
}

export interface LLMMessage {
  readonly role: LLMMessageRole;
  readonly content: string;
}
