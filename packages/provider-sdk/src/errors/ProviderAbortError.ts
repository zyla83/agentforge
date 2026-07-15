import { resolveProviderName } from "./ProviderError.js";
import { ProviderRequestError } from "./ProviderRequestError.js";

export class ProviderAbortError extends ProviderRequestError {
  constructor(providerName: string, options?: ErrorOptions) {
    const resolvedProviderName = resolveProviderName(providerName);
    super(
      resolvedProviderName,
      `Provider "${resolvedProviderName}" request was aborted.`,
      options,
    );
    this.name = "ProviderAbortError";
  }
}
