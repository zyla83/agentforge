import { resolveProviderName } from "../../errors/ProviderError.js";
import { ProviderError } from "../../errors/index.js";

export class ProviderNotFoundError extends ProviderError {
  constructor(providerName: string) {
    const resolvedProviderName = resolveProviderName(providerName);
    super(
      `Provider "${resolvedProviderName}" is not registered.`,
      resolvedProviderName,
    );
    this.name = "ProviderNotFoundError";
  }
}
