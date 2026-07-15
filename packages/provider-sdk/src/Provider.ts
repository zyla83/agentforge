import type { ProviderHealth } from "./ProviderHealth.js";
import type { ProviderMetadata } from "./ProviderMetadata.js";
import type { ProviderRequestOptions } from "./ProviderRequestOptions.js";

export interface Provider {
  readonly metadata: ProviderMetadata;

  checkHealth(options?: ProviderRequestOptions): Promise<ProviderHealth>;
}
