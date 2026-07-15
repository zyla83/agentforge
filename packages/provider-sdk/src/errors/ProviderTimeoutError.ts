import { resolveProviderName } from "./ProviderError.js";
import { ProviderRequestError } from "./ProviderRequestError.js";

export class ProviderTimeoutError extends ProviderRequestError {
  readonly timeoutMs: number;

  constructor(providerName: string, timeoutMs: number, options?: ErrorOptions) {
    const resolvedProviderName = resolveProviderName(providerName);
    super(
      resolvedProviderName,
      `Provider "${resolvedProviderName}" request timed out after ${timeoutMs} ms.`,
      options,
    );
    this.name = "ProviderTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
