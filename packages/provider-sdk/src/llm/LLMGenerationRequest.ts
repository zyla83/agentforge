import type { ProviderRequestOptions } from "../ProviderRequestOptions.js";
import type { ToolDefinition } from "../tools/index.js";
import type { LLMGenerationOptions } from "./LLMGenerationOptions.js";
import type { LLMMessage } from "./LLMMessage.js";

export interface LLMGenerationRequest {
  readonly model: string;
  readonly messages: readonly LLMMessage[];
  readonly tools?: readonly Readonly<ToolDefinition>[];
  readonly generation?: LLMGenerationOptions;
  readonly request?: ProviderRequestOptions;
}
