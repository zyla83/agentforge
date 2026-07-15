import { OllamaClientError } from "./OllamaClientError.js";

export class OllamaTimeoutError extends OllamaClientError {
  readonly timeoutMs: number;
  readonly endpoint: string;

  constructor(endpoint: string, timeoutMs: number, options?: ErrorOptions) {
    super(
      `Ollama request to "${endpoint}" timed out after ${timeoutMs} ms.`,
      options,
    );
    this.name = "OllamaTimeoutError";
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}
