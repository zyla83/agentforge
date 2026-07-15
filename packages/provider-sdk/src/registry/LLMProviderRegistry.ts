import type { ProviderMetadata } from "../ProviderMetadata.js";
import type { LLMProvider } from "../llm/index.js";

export interface LLMProviderRegistry {
  has(name: string): boolean;

  get(name: string): LLMProvider | undefined;

  getMetadata(name: string): Readonly<ProviderMetadata> | undefined;

  list(): readonly Readonly<ProviderMetadata>[];

  getDefault(): LLMProvider | undefined;

  getDefaultMetadata(): Readonly<ProviderMetadata> | undefined;
}
