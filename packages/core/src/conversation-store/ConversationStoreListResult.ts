import type { ConversationStoreEntry } from "./ConversationStoreEntry.js";

export interface ConversationStoreListResult {
  readonly entries: readonly Readonly<ConversationStoreEntry>[];
  readonly nextCursor?: string;
}
