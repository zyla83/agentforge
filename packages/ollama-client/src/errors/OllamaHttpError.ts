import { OllamaClientError } from "./OllamaClientError.js";

export class OllamaHttpError extends OllamaClientError {
  readonly status: number;
  readonly statusText: string;
  readonly endpoint: string;
  readonly serverMessage?: string;

  constructor(
    endpoint: string,
    status: number,
    statusText: string,
    serverMessage?: string,
  ) {
    const suffix = serverMessage === undefined ? "." : `: ${serverMessage}.`;
    super(
      `Ollama request to "${endpoint}" failed with HTTP ${status}${suffix}`,
    );
    this.name = "OllamaHttpError";
    this.endpoint = endpoint;
    this.status = status;
    this.statusText = statusText;
    if (serverMessage !== undefined) {
      this.serverMessage = serverMessage;
    }
  }
}
