import type {
  LLMGenerationOptions,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type { AgentProfile } from "../agent-profile/index.js";
import type { Conversation } from "../conversation/index.js";

export interface ConversationTurnInput {
  readonly conversation: Conversation;
  readonly content: string;
  readonly model?: string;
  readonly provider?: string;
  readonly generation?: LLMGenerationOptions;
  readonly request?: ProviderRequestOptions;
  readonly profile?: AgentProfile;
}
