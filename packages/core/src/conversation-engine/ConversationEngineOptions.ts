import type { JsonValue, ToolRegistry } from "@agentforge/provider-sdk";
import type { AgentProfile } from "../agent-profile/index.js";
import type { ConversationFactoryOptions } from "../conversation/index.js";
import type { ConversationEngineObservabilityOptions } from "../tools/index.js";
import type { ConversationProviderResolver } from "./ConversationProviderResolver.js";

export interface ConversationEngineOptions {
  readonly providers: ConversationProviderResolver;
  readonly conversationFactory?: ConversationFactoryOptions;
  readonly profile?: AgentProfile;
  readonly signal?: AbortSignal;
  readonly tools?: ToolRegistry;
  readonly toolExecution?: {
    readonly enabled?: boolean;
    readonly maxRounds?: number;
    readonly metadata?: Readonly<Record<string, JsonValue>>;
  };
  readonly observability?: Readonly<ConversationEngineObservabilityOptions>;
}
