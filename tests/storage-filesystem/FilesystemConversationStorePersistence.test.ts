import { readFile, readdir } from "node:fs/promises";
import {
  CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
  CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
} from "@agentforge/core";
import { createFilesystemConversationStore } from "@agentforge/storage-filesystem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesystemOperations } from "../../packages/storage-filesystem/src/internal/createAtomicFileWriter.js";
import {
  conversation,
  conversationFilePath,
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

describe("FilesystemConversationStore persistence", () => {
  it("writes one encoded V1 JSON file with pretty output by default", async () => {
    const root = await temporaryRoot();
    const id = "../unsafe\\id: with spaces 🧪";
    const store = createFilesystemConversationStore({ directory: root });

    const saved = await store.save(conversation(id));
    const filenames = await readdir(conversationsPath(root));
    const filePath = conversationFilePath(root, id);
    const contents = await readFile(filePath, "utf8");
    const document = JSON.parse(contents);

    expect(filenames).toEqual([
      `${Buffer.from(id, "utf8").toString("base64url")}.json`,
    ]);
    expect(contents.startsWith('{\n  "kind"')).toBe(true);
    expect(document).toMatchObject({
      kind: CONVERSATION_STORE_ENTRY_DOCUMENT_KIND,
      version: CONVERSATION_STORE_ENTRY_DOCUMENT_VERSION,
      entry: {
        conversation: { id },
        revision: 1,
      },
    });
    expect(saved.revision).toBe(1);
  });

  it("writes compact JSON when pretty is false", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({
      directory: root,
      pretty: false,
    });

    await store.save(conversation("compact"));
    const contents = await readFile(
      conversationFilePath(root, "compact"),
      "utf8",
    );

    expect(contents).not.toContain("\n");
  });

  it("uses the injected clock once per save and increments revisions", async () => {
    const dates = [
      new Date("2026-07-17T12:00:00.000Z"),
      new Date("2026-07-17T12:01:00.000Z"),
    ];
    const now = vi.fn(() => dates.shift() ?? new Date(0));
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
      now,
    });

    const first = await store.save(conversation("revision"));
    const second = await store.save(
      conversation("revision", "2026-07-17T10:01:00.000Z"),
    );

    expect(first).toMatchObject({
      revision: 1,
      savedAt: "2026-07-17T12:00:00.000Z",
    });
    expect(second).toMatchObject({
      revision: 2,
      savedAt: "2026-07-17T12:01:00.000Z",
    });
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("survives a new store instance and continues persisted revision", async () => {
    const root = await temporaryRoot();
    const storeA = createFilesystemConversationStore({
      directory: root,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
    });
    await storeA.save(conversation("persistent", undefined, "First"));

    const storeB = createFilesystemConversationStore({
      directory: root,
      now: () => new Date("2026-07-17T12:01:00.000Z"),
    });
    const loaded = await storeB.require("persistent");
    const listed = await storeB.list();
    const updated = await storeB.save(
      conversation("persistent", "2026-07-17T10:01:00.000Z", "Second"),
    );

    expect(loaded).toMatchObject({
      revision: 1,
      savedAt: "2026-07-17T12:00:00.000Z",
      conversation: { messages: [{ content: "First" }] },
    });
    expect(listed.entries).toEqual([loaded]);
    expect(updated.revision).toBe(2);
  });

  it("snapshots mutable input and round trips Unicode content", async () => {
    const root = await temporaryRoot();
    const source = conversation(
      "rozmowa-🧪",
      undefined,
      "Zażółć 🧪\nDruga linia",
    );
    const messages = source.messages as Array<{ content: string }>;
    const store = createFilesystemConversationStore({ directory: root });

    const saved = await store.save(source);
    const first = messages[0];
    if (first === undefined) throw new Error("Expected a message.");
    first.content = "mutated";
    const loaded = await store.require("rozmowa-🧪");

    expect(saved.conversation.messages[0]?.content).toBe(
      "Zażółć 🧪\nDruga linia",
    );
    expect(loaded.conversation.messages[0]?.content).toBe(
      "Zażółć 🧪\nDruga linia",
    );
    expect(Object.isFrozen(saved)).toBe(true);
  });

  it("leaves no temporary or backup file after successful saves", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("clean"));
    await store.save(conversation("clean"));

    expect(await readdir(conversationsPath(root))).toEqual([
      `${Buffer.from("clean").toString("base64url")}.json`,
    ]);
  });
});

describe("FilesystemConversationStore concurrent and failed saves", () => {
  it("serializes same-ID saves to unique revisions and keeps the last value", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });

    const first = store.save(conversation("queued", undefined, "First"));
    const second = store.save(
      conversation("queued", "2026-07-17T10:01:00.000Z", "Second"),
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.revision).toBe(1);
    expect(secondResult.revision).toBe(2);
    expect(
      (await store.require("queued")).conversation.messages[0]?.content,
    ).toBe("Second");
  });

  it("allows separate IDs to save successfully", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });

    const [one, two] = await Promise.all([
      store.save(conversation("one")),
      store.save(conversation("two")),
    ]);

    expect(one.revision).toBe(1);
    expect(two.revision).toBe(1);
    expect((await store.list()).entries).toHaveLength(2);
  });

  it("preserves the old file after a temporary write failure and recovers the queue", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("failure", undefined, "Original"));
    vi.spyOn(filesystemOperations, "open").mockRejectedValueOnce(
      nodeError("EIO"),
    );

    await expect(
      store.save(conversation("failure", "2026-07-17T10:01:00.000Z", "Failed")),
    ).rejects.toMatchObject({ name: "ConversationStoreIoError", code: "EIO" });
    expect(
      (await store.require("failure")).conversation.messages[0]?.content,
    ).toBe("Original");

    const recovered = await store.save(
      conversation("failure", "2026-07-17T10:02:00.000Z", "Recovered"),
    );
    expect(recovered.revision).toBe(2);
    expect(await readdir(conversationsPath(root))).toHaveLength(1);
  });

  it("preserves the old file after a commit rename failure", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("rename", undefined, "Original"));
    vi.spyOn(filesystemOperations, "rename").mockRejectedValueOnce(
      nodeError("EIO"),
    );

    await expect(
      store.save(conversation("rename", "2026-07-17T10:01:00.000Z", "Failed")),
    ).rejects.toMatchObject({ name: "ConversationStoreIoError", code: "EIO" });
    expect(
      (await store.require("rename")).conversation.messages[0]?.content,
    ).toBe("Original");
    expect(await readdir(conversationsPath(root))).toHaveLength(1);
  });

  it("a failed save for one ID does not block another ID", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });
    vi.spyOn(filesystemOperations, "open").mockRejectedValueOnce(
      nodeError("EIO"),
    );

    const failed = store.save(conversation("failed"));
    const successful = store.save(conversation("successful"));

    await expect(failed).rejects.toMatchObject({ code: "EIO" });
    await expect(successful).resolves.toMatchObject({ revision: 1 });
  });
});

function nodeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
