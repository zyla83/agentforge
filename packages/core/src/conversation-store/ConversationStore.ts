import type { Conversation } from "../conversation/index.js";
import type { ConversationStoreEntry } from "./ConversationStoreEntry.js";
import type { ConversationStoreListOptions } from "./ConversationStoreListOptions.js";
import type { ConversationStoreListResult } from "./ConversationStoreListResult.js";

export interface ConversationStore {
  save(conversation: Conversation): Promise<Readonly<ConversationStoreEntry>>;

  get(
    conversationId: string,
  ): Promise<Readonly<ConversationStoreEntry> | undefined>;

  require(conversationId: string): Promise<Readonly<ConversationStoreEntry>>;

  list(
    options?: ConversationStoreListOptions,
  ): Promise<Readonly<ConversationStoreListResult>>;

  delete(conversationId: string): Promise<boolean>;

  clear(): Promise<void>;
}
