export type FetchImplementation = typeof globalThis.fetch;

export interface OllamaClientOptions {
  readonly baseUrl?: string;
  readonly defaultTimeoutMs?: number;
  readonly fetch?: FetchImplementation;
}
