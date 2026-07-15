import type {
  OllamaClient,
  OllamaClientOptions,
} from "@agentforge/ollama-client";

export interface OllamaLLMProviderOptions {
  readonly client?: OllamaClient;
  readonly clientOptions?: OllamaClientOptions;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
}
