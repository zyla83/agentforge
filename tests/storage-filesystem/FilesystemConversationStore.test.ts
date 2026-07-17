import { lstat, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ConversationNotFoundError,
  ConversationStoreOrder,
  InvalidConversationStoreInputError,
} from "@agentforge/core";
import {
  FilesystemConversationStore,
  createFilesystemConversationStore,
} from "@agentforge/storage-filesystem";
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

describe("FilesystemConversationStore initialization", () => {
  it("performs no filesystem work in the constructor", async () => {
    const root = join(await temporaryRoot(), "missing");
    const mkdirSpy = vi.spyOn(filesystemOperations, "mkdir");

    new FilesystemConversationStore({ directory: root });

    expect(mkdirSpy).not.toHaveBeenCalled();
    await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates a missing root and conversations directory lazily", async () => {
    const root = join(await temporaryRoot(), "data");
    const store = createFilesystemConversationStore({ directory: root });

    await store.list();

    expect((await lstat(root)).isDirectory()).toBe(true);
    expect((await lstat(conversationsPath(root))).isDirectory()).toBe(true);
  });

  it("accepts an existing root", async () => {
    const root = await temporaryRoot();

    await expect(
      createFilesystemConversationStore({ directory: root }).list(),
    ).resolves.toEqual({ entries: [] });
  });

  it("shares initialization across simultaneous first operations", async () => {
    const root = join(await temporaryRoot(), "data");
    const mkdirSpy = vi.spyOn(filesystemOperations, "mkdir");
    const store = createFilesystemConversationStore({ directory: root });

    await Promise.all([store.list(), store.get("missing"), store.clear()]);

    expect(mkdirSpy).toHaveBeenCalledTimes(2);
  });

  it("does not mutate or freeze caller options", () => {
    const options = { directory: "./relative-data", pretty: false };

    new FilesystemConversationStore(options);

    expect(options).toEqual({ directory: "./relative-data", pretty: false });
    expect(Object.isFrozen(options)).toBe(false);
  });
});

describe("FilesystemConversationStore get, require, and delete", () => {
  it("gets and requires immutable persisted entries", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("existing"));

    const loaded = await store.get("existing");

    expect(loaded).toEqual(await store.require("existing"));
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded?.conversation)).toBe(true);
    expect(Object.isFrozen(loaded?.conversation.messages)).toBe(true);
    expect(Object.isFrozen(loaded?.conversation.messages[0])).toBe(true);
  });

  it("distinguishes missing get and require", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });

    await expect(store.get("missing")).resolves.toBeUndefined();
    await expect(store.require("missing")).rejects.toEqual(
      new ConversationNotFoundError("missing"),
    );
  });

  it.each(["", "   ", 42, null])("rejects malformed ID %#", async (id) => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });

    await expect(store.get(id as string)).rejects.toBeInstanceOf(
      InvalidConversationStoreInputError,
    );
    await expect(store.delete(id as string)).rejects.toBeInstanceOf(
      InvalidConversationStoreInputError,
    );
  });

  it("preserves whitespace around exact IDs", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });
    await store.save(conversation(" conversation "));

    await expect(store.get("conversation")).resolves.toBeUndefined();
    await expect(store.require(" conversation ")).resolves.toMatchObject({
      conversation: { id: " conversation " },
    });
  });

  it("deletes idempotently and restarts revision at one", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });
    await store.save(conversation("deleted"));
    await store.save(conversation("deleted"));

    await expect(store.delete("deleted")).resolves.toBe(true);
    await expect(store.delete("deleted")).resolves.toBe(false);
    await expect(store.save(conversation("deleted"))).resolves.toMatchObject({
      revision: 1,
    });
  });

  it("does not call the clock for reads or deletion", async () => {
    const now = vi.fn(() => new Date("2026-07-17T12:00:00.000Z"));
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
      now,
    });
    await store.save(conversation("clock"));
    now.mockClear();

    await store.get("clock");
    await store.require("clock");
    await store.list();
    await store.delete("clock");

    expect(now).not.toHaveBeenCalled();
  });
});

describe("FilesystemConversationStore listing", () => {
  it("orders deterministically and supports ascending order", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });
    await store.save(conversation("z", "2026-07-17T10:01:00.000Z"));
    await store.save(conversation("b", "2026-07-17T10:02:00.000Z"));
    await store.save(conversation("a", "2026-07-17T10:02:00.000Z"));

    expect(
      (await store.list()).entries.map(({ conversation }) => conversation.id),
    ).toEqual(["a", "b", "z"]);
    expect(
      (
        await store.list({ order: ConversationStoreOrder.UpdatedAscending })
      ).entries.map(({ conversation }) => conversation.id),
    ).toEqual(["z", "a", "b"]);
  });

  it("paginates with an opaque cursor and no final cursor", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });
    for (const id of ["a", "b", "c", "d", "e"]) {
      await store.save(conversation(id));
    }

    const first = await store.list({ limit: 2 });
    const second = await store.list({ limit: 2, cursor: first.nextCursor });
    const third = await store.list({ limit: 2, cursor: second.nextCursor });

    expect(first.entries.map(({ conversation }) => conversation.id)).toEqual([
      "a",
      "b",
    ]);
    expect(second.entries.map(({ conversation }) => conversation.id)).toEqual([
      "c",
      "d",
    ]);
    expect(third.entries.map(({ conversation }) => conversation.id)).toEqual([
      "e",
    ]);
    expect(third.nextCursor).toBeUndefined();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.entries)).toBe(true);
  });

  it("rejects malformed limits, cursors, and cursor order mismatches", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });
    await store.save(conversation("a"));
    await store.save(conversation("b"));
    const first = await store.list({ limit: 1 });

    for (const limit of [0, -1, 1.5, 101]) {
      await expect(store.list({ limit })).rejects.toBeInstanceOf(
        InvalidConversationStoreInputError,
      );
    }
    await expect(store.list({ cursor: "invalid" })).rejects.toBeInstanceOf(
      InvalidConversationStoreInputError,
    );
    await expect(
      store.list({
        cursor: first.nextCursor,
        order: ConversationStoreOrder.UpdatedAscending,
      }),
    ).rejects.toMatchObject({
      details: ["cursor does not match the selected order"],
    });
  });

  it("ignores unrelated, temporary, backup, and symlink entries", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("kept"));
    const directory = conversationsPath(root);
    await writeFile(join(directory, "unrelated.txt"), "ignore");
    await writeFile(
      join(directory, ".YWJj.123e4567-e89b-12d3-a456-426614174000.tmp"),
      "ignore",
    );
    await writeFile(
      join(directory, ".YWJj.123e4567-e89b-12d3-a456-426614174000.bak"),
      "ignore",
    );
    await symlink(
      conversationFilePath(root, "kept"),
      join(directory, "link.json"),
    ).catch(() => undefined);

    expect((await store.list()).entries).toHaveLength(1);
  });
});

describe("FilesystemConversationStore clear", () => {
  it("removes owned files and stale artifacts conservatively", async () => {
    const root = await temporaryRoot();
    const store = createFilesystemConversationStore({ directory: root });
    await store.save(conversation("one"));
    await store.save(conversation("two"));
    const directory = conversationsPath(root);
    const unrelated = join(directory, "keep.txt");
    const outside = join(root, "outside.txt");
    const stale = join(
      directory,
      ".YWJj.123e4567-e89b-12d3-a456-426614174000.tmp",
    );
    await writeFile(unrelated, "keep");
    await writeFile(outside, "keep");
    await writeFile(stale, "stale");

    await store.clear();

    expect((await store.list()).entries).toHaveLength(0);
    expect(await readFile(unrelated, "utf8")).toBe("keep");
    expect(await readFile(outside, "utf8")).toBe("keep");
    expect((await lstat(directory)).isDirectory()).toBe(true);
    expect((await readdir(directory)).sort()).toEqual(["keep.txt"]);
  });

  it("succeeds on an empty store", async () => {
    const store = createFilesystemConversationStore({
      directory: await temporaryRoot(),
    });

    await expect(store.clear()).resolves.toBeUndefined();
  });
});
