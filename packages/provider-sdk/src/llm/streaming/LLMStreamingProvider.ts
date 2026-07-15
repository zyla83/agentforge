import type { LLMGenerationRequest } from "../LLMGenerationRequest.js";
import type { LLMProvider } from "../LLMProvider.js";
import type { LLMStreamEvent } from "./LLMStreamEvent.js";

export interface LLMStreamingProvider extends LLMProvider {
  stream(request: LLMGenerationRequest): AsyncIterable<LLMStreamEvent>;
}
