import type { LLMFinishReason, ProviderHealth } from "@agentforge/provider-sdk";

export interface MockLLMProviderOptions {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly responseContent?: string;
  readonly finishReason?: LLMFinishReason;
  readonly health?: ProviderHealth;
}
