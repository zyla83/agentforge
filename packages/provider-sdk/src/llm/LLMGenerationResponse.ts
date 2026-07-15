import type { LLMFinishReason } from "./LLMFinishReason.js";
import type { LLMMessage } from "./LLMMessage.js";
import type { LLMTokenUsage } from "./LLMTokenUsage.js";

export interface LLMGenerationResponse {
  readonly model: string;
  readonly message: Readonly<LLMMessage>;
  readonly finishReason: LLMFinishReason;
  readonly usage?: Readonly<LLMTokenUsage>;
}
