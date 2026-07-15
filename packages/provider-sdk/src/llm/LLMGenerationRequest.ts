import type { ProviderRequestOptions } from "../ProviderRequestOptions.js";
import type { LLMGenerationOptions } from "./LLMGenerationOptions.js";
import type { LLMMessage } from "./LLMMessage.js";

export interface LLMGenerationRequest {
  readonly model: string;
  readonly messages: readonly LLMMessage[];
  readonly generation?: LLMGenerationOptions;
  readonly request?: ProviderRequestOptions;
}
