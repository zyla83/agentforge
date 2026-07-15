import { resolveProviderName } from "../../errors/ProviderError.js";
import { ProviderError } from "../../errors/index.js";

export class DuplicateProviderError extends ProviderError {
  constructor(providerName: string) {
    const resolvedProviderName = resolveProviderName(providerName);
    super(
      `Provider "${resolvedProviderName}" is already registered.`,
      resolvedProviderName,
    );
    this.name = "DuplicateProviderError";
  }
}
