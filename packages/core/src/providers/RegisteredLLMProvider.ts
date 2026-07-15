import type { LLMProvider, ProviderMetadata } from "@agentforge/provider-sdk";

export interface RegisteredLLMProvider {
  readonly provider: LLMProvider;
  readonly metadata: Readonly<ProviderMetadata>;
}
