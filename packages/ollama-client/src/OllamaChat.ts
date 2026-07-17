export type OllamaJsonPrimitive = string | number | boolean | null;

export type OllamaJsonValue =
  | OllamaJsonPrimitive
  | readonly OllamaJsonValue[]
  | { readonly [key: string]: OllamaJsonValue };

export interface OllamaJsonObject {
  readonly [key: string]: OllamaJsonValue;
}

export interface OllamaToolFunction {
  readonly name: string;
  readonly description?: string;
  readonly parameters: Readonly<OllamaJsonObject>;
}

export interface OllamaTool {
  readonly type: "function";
  readonly function: Readonly<OllamaToolFunction>;
}

export interface OllamaToolCallFunction {
  readonly name: string;
  readonly arguments: Readonly<OllamaJsonObject>;
}

export interface OllamaToolCall {
  readonly function: Readonly<OllamaToolCallFunction>;
}

export type OllamaChatRole = "system" | "user" | "assistant" | "tool";

export interface OllamaSystemMessage {
  readonly role: "system";
  readonly content: string;
}

export interface OllamaUserMessage {
  readonly role: "user";
  readonly content: string;
}

export interface OllamaAssistantTextMessage {
  readonly role: "assistant";
  readonly content: string;
}

export interface OllamaAssistantToolCallMessage {
  readonly role: "assistant";
  readonly content: string;
  readonly toolCalls: readonly Readonly<OllamaToolCall>[];
}

export interface OllamaToolResultMessage {
  readonly role: "tool";
  readonly content: string;
}

export type OllamaChatMessage =
  | OllamaSystemMessage
  | OllamaUserMessage
  | OllamaAssistantTextMessage
  | OllamaAssistantToolCallMessage
  | OllamaToolResultMessage;

export interface OllamaChatOptions {
  readonly temperature?: number;
  readonly top_p?: number;
  readonly num_predict?: number;
  readonly stop?: readonly string[];
}

export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: readonly Readonly<OllamaChatMessage>[];
  readonly tools?: readonly Readonly<OllamaTool>[];
  readonly options?: Readonly<OllamaChatOptions>;
}

export type OllamaAssistantMessage =
  | OllamaAssistantTextMessage
  | OllamaAssistantToolCallMessage;

export interface OllamaChatResponse {
  readonly model: string;
  readonly message: Readonly<OllamaAssistantMessage>;
  readonly done: boolean;
  readonly doneReason?: string;
  readonly promptEvalCount?: number;
  readonly evalCount?: number;
}

export interface OllamaChatStreamChunk {
  readonly model?: string;
  readonly message?: Readonly<OllamaAssistantMessage>;
  readonly done: boolean;
  readonly doneReason?: string;
  readonly promptEvalCount?: number;
  readonly evalCount?: number;
}
