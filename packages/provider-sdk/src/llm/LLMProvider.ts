import type { Provider } from "../Provider.js";
import type { LLMGenerationRequest } from "./LLMGenerationRequest.js";
import type { LLMGenerationResponse } from "./LLMGenerationResponse.js";
import type { LLMProviderCapabilities } from "./LLMProviderCapabilities.js";

export interface LLMProvider extends Provider {
  readonly capabilities?: LLMProviderCapabilities;
  generate(request: LLMGenerationRequest): Promise<LLMGenerationResponse>;
}
