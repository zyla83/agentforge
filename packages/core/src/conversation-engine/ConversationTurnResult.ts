import type { LLMGenerationResponse } from "@agentforge/provider-sdk";
import type {
  Conversation,
  ConversationMessage,
} from "../conversation/index.js";
import type { ToolExecutionRecord } from "../tools/index.js";

export interface ConversationTurnResult {
  readonly conversation: Readonly<Conversation>;
  readonly userMessage: Readonly<ConversationMessage>;
  readonly assistantMessage: Readonly<ConversationMessage>;
  readonly response: Readonly<LLMGenerationResponse>;
  readonly provider: string;
  readonly model: string;
  readonly profile: string | undefined;
  readonly toolExecutions: readonly Readonly<ToolExecutionRecord>[];
  readonly providerRounds: number;
}
