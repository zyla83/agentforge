import type { LLMProvider } from "./LLMProvider.js";
import type { LLMProviderCapabilities } from "./LLMProviderCapabilities.js";
import { isLLMStreamingProvider } from "./streaming/index.js";

export function getLLMProviderCapabilities(
  provider: LLMProvider,
): Readonly<LLMProviderCapabilities> {
  return Object.freeze({
    streaming: isLLMStreamingProvider(provider),
    tools: provider.capabilities?.tools === true,
  });
}
