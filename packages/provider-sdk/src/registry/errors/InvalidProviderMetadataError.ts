import { resolveProviderName } from "../../errors/ProviderError.js";
import { ProviderError } from "../../errors/index.js";

export class InvalidProviderMetadataError extends ProviderError {
  readonly details: readonly string[];

  constructor(
    providerName: string,
    details: readonly string[],
    options?: ErrorOptions,
  ) {
    const resolvedProviderName = resolveProviderName(providerName);
    const detailsSnapshot = Object.freeze([...details]);
    super(
      `Provider "${resolvedProviderName}" metadata is invalid: ${detailsSnapshot.join("; ")}.`,
      resolvedProviderName,
      options,
    );
    this.name = "InvalidProviderMetadataError";
    this.details = detailsSnapshot;
  }
}
