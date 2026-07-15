import { ProviderRequestError } from "../../errors/index.js";

export class InvalidLLMRequestError extends ProviderRequestError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const detailsSnapshot = Object.freeze([...details]);
    super(
      "<unknown>",
      `The LLM generation request is invalid: ${detailsSnapshot.join("; ")}.`,
      options,
    );
    this.name = "InvalidLLMRequestError";
    this.details = detailsSnapshot;
  }
}
