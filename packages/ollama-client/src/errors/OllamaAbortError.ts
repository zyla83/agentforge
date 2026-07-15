import { OllamaClientError } from "./OllamaClientError.js";

export class OllamaAbortError extends OllamaClientError {
  readonly endpoint: string;

  constructor(endpoint: string, options?: ErrorOptions) {
    super(`Ollama request to "${endpoint}" was aborted.`, options);
    this.name = "OllamaAbortError";
    this.endpoint = endpoint;
  }
}
