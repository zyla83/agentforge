import { ProviderError, resolveProviderName } from "./ProviderError.js";

export class ProviderUnavailableError extends ProviderError {
  constructor(providerName: string, message?: string, options?: ErrorOptions) {
    const resolvedProviderName = resolveProviderName(providerName);
    super(
      message ?? `Provider "${resolvedProviderName}" is unavailable.`,
      resolvedProviderName,
      options,
    );
    this.name = "ProviderUnavailableError";
  }
}
