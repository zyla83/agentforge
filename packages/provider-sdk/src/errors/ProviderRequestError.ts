import { ProviderError } from "./ProviderError.js";

export class ProviderRequestError extends ProviderError {
  constructor(providerName: string, message: string, options?: ErrorOptions) {
    super(message, providerName, options);
    this.name = "ProviderRequestError";
  }
}
