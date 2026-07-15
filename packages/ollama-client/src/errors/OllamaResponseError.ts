import { OllamaClientError } from "./OllamaClientError.js";

export class OllamaResponseError extends OllamaClientError {
  readonly endpoint: string;
  readonly details: readonly string[];

  constructor(
    endpoint: string,
    details: readonly string[],
    options?: ErrorOptions,
  ) {
    const copiedDetails = Object.freeze([...details]);
    super(
      `Invalid Ollama response from "${endpoint}": ${copiedDetails.join("; ")}.`,
      options,
    );
    this.name = "OllamaResponseError";
    this.endpoint = endpoint;
    this.details = copiedDetails;
  }
}
