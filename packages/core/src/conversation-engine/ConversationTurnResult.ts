import type { LLMGenerationResponse } from "@agentforge/provider-sdk";
import type {
  Conversation,
  ConversationMessage,
} from "../conversation/index.js";

export interface ConversationTurnResult {
  readonly conversation: Readonly<Conversation>;
  readonly userMessage: Readonly<ConversationMessage>;
  readonly assistantMessage: Readonly<ConversationMessage>;
  readonly response: Readonly<LLMGenerationResponse>;
  readonly provider: string;
}
