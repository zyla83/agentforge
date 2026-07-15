import { OllamaClientError } from "./OllamaClientError.js";

export class OllamaConnectionError extends OllamaClientError {
  readonly baseUrl: string;

  constructor(baseUrl: string, options?: ErrorOptions) {
    super(`Unable to connect to Ollama at "${baseUrl}".`, options);
    this.name = "OllamaConnectionError";
    this.baseUrl = baseUrl;
  }
}
