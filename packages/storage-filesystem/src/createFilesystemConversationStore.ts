import type { ConversationStore } from "@agentforge/core";
import { FilesystemConversationStore } from "./FilesystemConversationStore.js";
import type { FilesystemConversationStoreOptions } from "./FilesystemConversationStoreOptions.js";

export function createFilesystemConversationStore(
  options: FilesystemConversationStoreOptions,
): ConversationStore {
  return new FilesystemConversationStore(options);
}
