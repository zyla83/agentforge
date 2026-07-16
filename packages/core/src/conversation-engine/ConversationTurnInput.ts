import type {
  LLMGenerationOptions,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type { Conversation } from "../conversation/index.js";

export interface ConversationTurnInput {
  readonly conversation: Conversation;
  readonly content: string;
  readonly model: string;
  readonly provider?: string;
  readonly generation?: LLMGenerationOptions;
  readonly request?: ProviderRequestOptions;
}
