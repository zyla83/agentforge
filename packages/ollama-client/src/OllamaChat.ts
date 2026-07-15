export type OllamaChatRole = "system" | "user" | "assistant";

export interface OllamaChatMessage {
  readonly role: OllamaChatRole;
  readonly content: string;
}

export interface OllamaChatOptions {
  readonly temperature?: number;
  readonly top_p?: number;
  readonly num_predict?: number;
  readonly stop?: readonly string[];
}

export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: readonly OllamaChatMessage[];
  readonly options?: OllamaChatOptions;
}

export interface OllamaChatResponse {
  readonly model: string;
  readonly message: Readonly<OllamaChatMessage>;
  readonly done: boolean;
  readonly doneReason?: string;
  readonly promptEvalCount?: number;
  readonly evalCount?: number;
}
