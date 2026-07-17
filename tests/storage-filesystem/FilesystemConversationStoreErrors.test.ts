import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ConversationStoreError,
  InvalidConversationStoreInputError,
} from "@agentforge/core";
import {
  ConversationStoreFileCorruptedError,
  ConversationStoreInitializationError,
  ConversationStoreIoError,
  FilesystemConversationStoreError,
  createFilesystemConversationStore,
} from "@agentforge/storage-filesystem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesystemOperations } from "../../packages/storage-filesystem/src/internal/createAtomicFileWriter.js";
import {
  conversation,
  conversationsPath,
  createTemporaryRoot,
  removeTemporaryRoot,
} from "./testUtils.js";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryRoot();
  roots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(removeTemporaryRoot));
});

describe("filesystem conversation store errors", () => {
  it("extends the core store error hierarchy", () => {
    const error = new FilesystemConversationStoreError("Filesystem failed.");

    expect(error).toBeInstanceOf(ConversationStoreError);
    expect(error.name).toBe("FilesystemConversationStoreError");
  });

  it("exposes deterministic corruption fields without document contents", () => {
    const cause = new Error("invalid document");
    const error = new ConversationStoreFileCorruptedError(
      "/data/conversation.json",
      "conversation",
      { cause },
    );

    expect(error.message).toBe(
      'Conversation store file "/data/conversation.json" is corrupted.',
    );
    expect(error.filePath).toBe("/data/conversation.json");
    expect(error.conversationId).toBe("conversation");
    expect(error.cause).toBe(cause);
  });

  it("preserves I/O operation, path, code, and cause", () => {
    const cause = nodeError("EACCES");
    const error = new ConversationStoreIoError("read", "/data/file.json", {
      cause,
    });

    expect(error).toBeInstanceOf(FilesystemConversationStoreError);
    expect(error.name).toBe("ConversationStoreIoError");
    expect(error.operation).toBe("read");
    expect(error.filePath).toBe("/data/file.json");
    expect(error.code).toBe("EACCES");
    expect(error.cause).toBe(cause);
  });

  it.each([
    undefined,
    null,
    {},
    { directory: "" },
    { directory: "   " },
    { directory: "data", now: 42 },
    { directory: "data", pretty: "yes" },
  ])("rejects invalid options %#", (options) => {
    expect(() => createFilesystemConversationStore(options as never)).toThrow(
      InvalidConversationStoreInputError,
    );
  });

  it("rejects a root path that is a regular file", async () => {
    const root = await temporaryRoot();
    const filePath = join(root, "store-file");
    await writeFile(filePath, "not a directory");
    const store = createFilesystemConversationStore({ directory: filePath });

    await expect(store.list()).rejects.toBeInstanceOf(
      ConversationStoreInitializationError,
    );
  });

  it("rejects a conversations path that is a regular file", async () => {
    const root = await temporaryRoot();
    await writeFile(conversationsPath(root), "not a directory");
    const store = createFilesystemConversationStore({ directory: root });

    await expect(store.list()).rejects.toBeInstanceOf(
      ConversationStoreInitializationError,
    );
  });

  it("wraps permission-like read failures as I/O errors", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("read-error"));
    vi.spyOn(filesystemOperations, "readFile").mockRejectedValueOnce(
      nodeError("EACCES"),
    );

    await expect(store.get("read-error")).rejects.toMatchObject({
      name: "ConversationStoreIoError",
      operation: "read",
      code: "EACCES",
    });
  });

  it("wraps directory listing failures as I/O errors", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.list();
    vi.spyOn(filesystemOperations, "readdir").mockRejectedValueOnce(
      nodeError("EIO"),
    );

    await expect(store.list()).rejects.toMatchObject({
      name: "ConversationStoreIoError",
      operation: "list",
      code: "EIO",
    });
  });

  it("rejects invalid clocks with a core input error", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
      now: () => new Date(Number.NaN),
    });

    await expect(store.save(conversation("clock"))).rejects.toBeInstanceOf(
      InvalidConversationStoreInputError,
    );
  });
});

function nodeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
