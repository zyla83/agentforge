import type { LLMProvider } from "../LLMProvider.js";
import type { LLMStreamingProvider } from "./LLMStreamingProvider.js";

export function isLLMStreamingProvider(
  provider: LLMProvider,
): provider is LLMStreamingProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    typeof (provider as { stream?: unknown }).stream === "function"
  );
}
