# @agentforge/storage-filesystem

Durable Node.js 22+ implementation of the AgentForge `ConversationStore`
contract using one versioned JSON file per conversation.

## Usage

```ts
import { createConversation } from "@agentforge/core";
import { createFilesystemConversationStore } from "@agentforge/storage-filesystem";

const store = createFilesystemConversationStore({
  directory: "./agentforge-data",
});

const saved = await store.save(createConversation());
const restored = await store.require(saved.conversation.id);
```

The adapter creates this layout lazily:

```text
agentforge-data/
  conversations/
    <base64url-conversation-id>.json
```

Conversation IDs are encoded from exact UTF-8 values as canonical unpadded
Base64URL filenames. Each file uses the versioned
`agentforge.conversation-store-entry` format from `@agentforge/core`. Files are
pretty-printed by default; pass `pretty: false` for compact JSON.

## Behavior

Each successful save replaces the current entry and increments its persisted
per-conversation revision. Deleting an entry resets its next revision to 1.
Loaded entries are deeply immutable. `list()` supports the same deterministic
ordering, limits, and opaque cursor pagination as the in-memory store.

Writes use a restrictive same-directory temporary file, flush it, and commit by
filesystem rename. A backup-and-restore fallback handles replacement conflicts
on platforms such as Windows. Adapter-owned stale temporary and backup files are
ignored by listing and can be removed by `clear()`. Corrupted canonical files
fail reads with typed corruption errors rather than being silently skipped.

Committed files persist across process restarts, and multiple store instances
may read the same trusted directory. This adapter persists conversations across
process restarts but does not coordinate concurrent writes from multiple
processes. Applications requiring multi-process consistency should use a
database adapter. Atomicity is process-local and relies on the configured
filesystem's rename semantics.

The configured directory must be trusted by the application. Listing and clear
operations ignore symlinks and unrelated files, and the adapter never
recursively removes the configured root.
