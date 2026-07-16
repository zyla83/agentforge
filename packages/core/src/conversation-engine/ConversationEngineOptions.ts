import type { ConversationFactoryOptions } from "../conversation/index.js";
import type { ConversationProviderResolver } from "./ConversationProviderResolver.js";

export interface ConversationEngineOptions {
  readonly providers: ConversationProviderResolver;
  readonly conversationFactory?: ConversationFactoryOptions;
}
