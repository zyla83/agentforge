import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ConversationSerializationError,
  serializeConversationStoreEntry,
} from "@agentforge/core";
import {
  ConversationStoreFileCorruptedError,
  createFilesystemConversationStore,
} from "@agentforge/storage-filesystem";
import { afterEach, describe, expect, it } from "vitest";
import {
  conversation,
  conversationFilePath,
  conversationsPath,
  createTemporaryRoot,
  createdAt,
  removeTemporaryRoot,
} from "./testUtils.js";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryRoot();
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeTemporaryRoot));
});

async function initializeRoot(root: string): Promise<void> {
  await mkdir(conversationsPath(root), { recursive: true });
}

function validDocument(id: string): Record<string, unknown> {
  return JSON.parse(
    serializeConversationStoreEntry({
      conversation: conversation(id),
      savedAt: "2026-07-17T12:00:00.000Z",
      revision: 1,
    }),
  );
}

describe("FilesystemConversationStore corrupted files", () => {
  it("wraps invalid JSON and preserves the serialization cause", async () => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    const filePath = conversationFilePath(root, "broken");
    await writeFile(filePath, "{", "utf8");
    const store = createFilesystemConversationStore({ directory: root });

    try {
      await store.get("broken");
      throw new Error("Expected reading to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ConversationStoreFileCorruptedError);
      expect(error).toMatchObject({
        filePath,
        conversationId: "broken",
        cause: expect.any(ConversationSerializationError),
      });
    }
  });

  it.each([
    [
      "wrong kind",
      (document: Record<string, unknown>) => {
        document.kind = "agentforge.conversation";
      },
    ],
    [
      "unsupported version",
      (document: Record<string, unknown>) => {
        document.version = 3;
      },
    ],
    [
      "missing entry",
      (document: Record<string, unknown>) => {
        document.entry = undefined;
      },
    ],
    [
      "invalid revision",
      (document: Record<string, unknown>) => {
        (document.entry as Record<string, unknown>).revision = 0;
      },
    ],
    [
      "invalid savedAt",
      (document: Record<string, unknown>) => {
        (document.entry as Record<string, unknown>).savedAt = "invalid";
      },
    ],
    [
      "invalid conversation",
      (document: Record<string, unknown>) => {
        const entry = document.entry as Record<string, unknown>;
        (entry.conversation as Record<string, unknown>).createdAt = "invalid";
      },
    ],
  ])("rejects %s as corruption", async (_name, mutate) => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    const document = validDocument("corrupted");
    mutate(document);
    await writeFile(
      conversationFilePath(root, "corrupted"),
      JSON.stringify(document),
      "utf8",
    );
    const store = createFilesystemConversationStore({ directory: root });

    await expect(store.require("corrupted")).rejects.toMatchObject({
      name: "ConversationStoreFileCorruptedError",
      conversationId: "corrupted",
      cause: expect.any(ConversationSerializationError),
    });
  });

  it("rejects a filename and document ID mismatch", async () => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    await writeFile(
      conversationFilePath(root, "filename-id"),
      JSON.stringify(validDocument("document-id")),
      "utf8",
    );
    const store = createFilesystemConversationStore({ directory: root });

    await expect(store.get("filename-id")).rejects.toMatchObject({
      name: "ConversationStoreFileCorruptedError",
      conversationId: "filename-id",
    });
  });

  it("rejects malformed UTF-8", async () => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    await writeFile(
      conversationFilePath(root, "invalid-utf8"),
      Buffer.from([0xc3, 0x28]),
    );
    const store = createFilesystemConversationStore({ directory: root });

    await expect(store.get("invalid-utf8")).rejects.toMatchObject({
      name: "ConversationStoreFileCorruptedError",
      conversationId: "invalid-utf8",
      cause: expect.any(TypeError),
    });
  });

  it("fails listing when a canonical conversation file is corrupted", async () => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    await writeFile(conversationFilePath(root, "broken-list"), "not-json");
    const store = createFilesystemConversationStore({ directory: root });

    await expect(store.list()).rejects.toBeInstanceOf(
      ConversationStoreFileCorruptedError,
    );
  });

  it("ignores malformed unrelated JSON filenames", async () => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    await writeFile(join(conversationsPath(root), "not-valid!.json"), "{");
    await writeFile(join(conversationsPath(root), ".json"), "{");
    const store = createFilesystemConversationStore({ directory: root });

    await expect(store.list()).resolves.toEqual({ entries: [] });
  });

  it("preserves valid timestamp strings exactly", async () => {
    const root = await temporaryRoot();
    await initializeRoot(root);
    const document = validDocument("offset");
    const entry = document.entry as Record<string, unknown>;
    entry.savedAt = "2026-07-17T14:00:00+02:00";
    const embedded = entry.conversation as Record<string, unknown>;
    embedded.createdAt = createdAt;
    embedded.updatedAt = createdAt;
    await writeFile(
      conversationFilePath(root, "offset"),
      JSON.stringify(document),
    );

    const loaded = await createFilesystemConversationStore({
      directory: root,
    }).require("offset");

    expect(loaded.savedAt).toBe("2026-07-17T14:00:00+02:00");
  });
});
