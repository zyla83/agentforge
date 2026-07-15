import type {
  OllamaClient,
  OllamaClientOptions,
} from "@agentforge/ollama-client";

export interface OllamaHealthCheckOptions {
  readonly model?: string;
}

export interface OllamaHealthDetails {
  readonly serverAvailable: boolean;
  readonly version?: string;
  readonly baseUrl?: string;
  readonly requiredModel?: string;
  readonly modelAvailable?: boolean;
  readonly installedModelCount?: number;
}

export interface OllamaLLMProviderOptions {
  readonly client?: OllamaClient;
  readonly clientOptions?: OllamaClientOptions;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly healthCheck?: OllamaHealthCheckOptions;
}
