import type { LLMFinishReason } from "./LLMFinishReason.js";
import type {
  LLMAssistantTextMessage,
  LLMAssistantToolCallMessage,
} from "./LLMMessage.js";
import type { LLMTokenUsage } from "./LLMTokenUsage.js";

export interface LLMGenerationResponse {
  readonly model: string;
  readonly message: Readonly<
    LLMAssistantTextMessage | LLMAssistantToolCallMessage
  >;
  readonly finishReason: LLMFinishReason;
  readonly usage?: Readonly<LLMTokenUsage>;
}
