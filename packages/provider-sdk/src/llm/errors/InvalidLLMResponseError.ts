import { ProviderError } from "../../errors/index.js";

export class InvalidLLMResponseError extends ProviderError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const detailsSnapshot = Object.freeze([...details]);
    super(
      `The LLM generation response is invalid: ${detailsSnapshot.join("; ")}.`,
      "<unknown>",
      options,
    );
    this.name = "InvalidLLMResponseError";
    this.details = detailsSnapshot;
  }
}
