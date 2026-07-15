import { OllamaClientError } from "./OllamaClientError.js";

export class OllamaRequestError extends OllamaClientError {
  readonly details: readonly string[];

  constructor(details: readonly string[]) {
    const copiedDetails = Object.freeze([...details]);
    super(`Invalid Ollama request: ${copiedDetails.join("; ")}.`);
    this.name = "OllamaRequestError";
    this.details = copiedDetails;
  }
}
