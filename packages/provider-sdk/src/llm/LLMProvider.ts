import type { Provider } from "../Provider.js";
import type { LLMGenerationRequest } from "./LLMGenerationRequest.js";
import type { LLMGenerationResponse } from "./LLMGenerationResponse.js";

export interface LLMProvider extends Provider {
  generate(request: LLMGenerationRequest): Promise<LLMGenerationResponse>;
}
