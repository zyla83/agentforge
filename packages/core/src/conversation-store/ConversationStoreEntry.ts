import type { Conversation } from "../conversation/index.js";

export interface ConversationStoreEntry {
  readonly conversation: Readonly<Conversation>;
  readonly savedAt: string;
  readonly revision: number;
}
