import type { ConversationStore } from "./ConversationStore.js";
import type { ConversationStoreEntry } from "./ConversationStoreEntry.js";
import { InMemoryConversationStore } from "./InMemoryConversationStore.js";

export interface InMemoryConversationStoreOptions {
  readonly now?: () => Date;
  readonly initialEntries?: readonly ConversationStoreEntry[];
}

export function createInMemoryConversationStore(
  options?: InMemoryConversationStoreOptions,
): ConversationStore {
  return new InMemoryConversationStore(options);
}
