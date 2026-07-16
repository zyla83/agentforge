import type { AgentProfile } from "../agent-profile/index.js";
import type { ConversationFactoryOptions } from "../conversation/index.js";
import type { ConversationProviderResolver } from "./ConversationProviderResolver.js";

export interface ConversationEngineOptions {
  readonly providers: ConversationProviderResolver;
  readonly conversationFactory?: ConversationFactoryOptions;
  readonly profile?: AgentProfile;
  readonly signal?: AbortSignal;
}
