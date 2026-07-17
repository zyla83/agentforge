import type { ConversationStoreEntry } from "@agentforge/core";

export function formatConversationList(
  entries: readonly Readonly<ConversationStoreEntry>[],
  currentConversationId: string,
  hasMore: boolean,
): string {
  if (entries.length === 0) return "No saved conversations.\n";

  const idWidth = Math.max(
    "ID".length,
    ...entries.map(({ conversation }) => conversation.id.length + 2),
  );
  const lines = [
    "Saved conversations:",
    "",
    `${"ID".padEnd(idWidth)}  Messages  Revision  Updated`,
  ];
  for (const entry of entries) {
    const marker =
      entry.conversation.id === currentConversationId ? "* " : "  ";
    const displayId = `${marker}${entry.conversation.id}`;
    lines.push(
      `${displayId.padEnd(idWidth)}  ${String(entry.conversation.messages.length).padEnd(8)}  ${String(entry.revision).padEnd(8)}  ${entry.conversation.updatedAt}`,
    );
  }
  if (hasMore) {
    lines.push("", "More conversations exist; only the first 100 are shown.");
  }
  return `${lines.join("\n")}\n`;
}
