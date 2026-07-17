import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import {
  createConversation,
  createInMemoryConversationStore,
  deserializeConversation,
  serializeConversation,
  serializeConversationStoreEntry,
} from "@agentforge/core";
import type {
  Conversation,
  ConversationStore,
  ConversationStoreEntry,
  ConversationStoreListOptions,
  ConversationStoreListResult,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { readImportedConversation } from "../../../examples/chat-cli/src/files/readImportedConversation.js";
import { writeExportedConversation } from "../../../examples/chat-cli/src/files/writeExportedConversation.js";
import {
  captureStream,
  createCompletedEngine,
  createTestApplication,
} from "./chatTestUtils.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("chat conversation export", () => {
  it("writes an atomic pretty V1 conversation document and overwrites files", async () => {
    const directory = await createTemporaryDirectory();
    const destination = join(directory, "nested path", "conversation.json");
    const conversation = createUnicodeConversation("exported");

    expect(await writeExportedConversation(destination, conversation)).toBe(
      destination,
    );
    const first = await readFile(destination, "utf8");
    expect(first).toContain('\n  "kind": "agentforge.conversation"');
    expect(first).not.toContain("conversation-store-entry");
    expect(deserializeConversation(first)).toEqual(conversation);
    await writeFile(destination, "old", "utf8");
    await writeExportedConversation(destination, conversation);
    expect(
      deserializeConversation(await readFile(destination, "utf8")),
    ).toEqual(conversation);
    expect(await readdir(dirname(destination))).toEqual(["conversation.json"]);
    expect((await lstat(destination)).isFile()).toBe(true);
  });

  it("rejects directory and symbolic-link destinations", async () => {
    const directory = await createTemporaryDirectory();
    await expect(
      writeExportedConversation(directory, createUnicodeConversation("one")),
    ).rejects.toThrow("regular file");

    const target = join(directory, "target.json");
    const link = join(directory, "link.json");
    await writeFile(target, "unchanged", "utf8");
    if (!(await tryCreateSymlink(target, link))) return;
    await expect(
      writeExportedConversation(link, createUnicodeConversation("two")),
    ).rejects.toThrow("symbolic link");
    expect(await readFile(target, "utf8")).toBe("unchanged");
  });
});

describe("chat conversation import", () => {
  it("reads strict UTF-8 plain conversation documents without changing source", async () => {
    const directory = await createTemporaryDirectory();
    const source = join(directory, "conversation one.json");
    const conversation = createUnicodeConversation("imported");
    const serialized = serializeConversation(conversation, { pretty: true });
    await writeFile(source, serialized, "utf8");

    const imported = await readImportedConversation(source);
    expect(imported.filePath).toBe(source);
    expect(imported.conversation).toEqual(conversation);
    expect(Object.isFrozen(imported.conversation)).toBe(true);
    expect(await readFile(source, "utf8")).toBe(serialized);
  });

  it("rejects missing files, directories, symlinks, and malformed UTF-8", async () => {
    const directory = await createTemporaryDirectory();
    await expect(
      readImportedConversation(join(directory, "missing.json")),
    ).rejects.toThrow("was not found");
    await expect(readImportedConversation(directory)).rejects.toThrow(
      "regular file",
    );

    const invalidUtf8 = join(directory, "invalid.json");
    await writeFile(invalidUtf8, Buffer.from([0xc3, 0x28]));
    await expect(readImportedConversation(invalidUtf8)).rejects.toThrow(
      "not valid UTF-8",
    );

    const valid = join(directory, "valid.json");
    const link = join(directory, "link.json");
    await writeFile(
      valid,
      serializeConversation(createUnicodeConversation("valid")),
      "utf8",
    );
    if (!(await tryCreateSymlink(valid, link))) return;
    await expect(readImportedConversation(link)).rejects.toThrow(
      "symbolic link",
    );
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "store-entry document",
      serializeConversationStoreEntry({
        conversation: createUnicodeConversation("stored"),
        revision: 1,
        savedAt: "2026-07-17T08:00:00.000Z",
      }),
    ],
    [
      "unsupported version",
      JSON.stringify({
        ...JSON.parse(
          serializeConversation(createUnicodeConversation("future")),
        ),
        version: 3,
      }),
    ],
    [
      "invalid conversation",
      JSON.stringify({
        kind: "agentforge.conversation",
        version: 1,
        conversation: { id: "broken" },
      }),
    ],
  ])("rejects %s", async (_name, contents) => {
    const directory = await createTemporaryDirectory();
    const source = join(directory, "invalid-document.json");
    await writeFile(source, contents, "utf8");
    await expect(readImportedConversation(source)).rejects.toThrow();
  });

  it("imports through the application and replaces an existing ID at a new revision", async () => {
    const directory = await createTemporaryDirectory();
    const source = join(directory, "import source.json");
    const imported = createUnicodeConversation("active");
    const sourceContents = serializeConversation(imported, { pretty: true });
    await writeFile(source, sourceContents, "utf8");
    const store = createInMemoryConversationStore();
    const initialEntry = await store.save(createConversation({ id: "active" }));
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine: createCompletedEngine([]),
      store,
      initialEntry,
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write(`/import "${source}"\n`);
    await output.waitFor(
      "Existing stored conversation replaced at revision 2.",
    );
    await output.waitFor("You: ", 2);
    input.write(`/export "${join(directory, "exports", "copy.json")}"\n`);
    await output.waitFor("Conversation exported to:");
    await output.waitFor("You: ", 3);
    input.write("/exit\n");
    await running;

    const entry = await store.require("active");
    expect(entry.revision).toBe(2);
    expect(entry.conversation).toEqual(imported);
    expect(await readFile(source, "utf8")).toBe(sourceContents);
    expect(
      deserializeConversation(
        await readFile(join(directory, "exports", "copy.json"), "utf8"),
      ),
    ).toEqual(imported);
    expect(errors.read()).toBe("");
  });

  it("preserves active state when saving a decoded import fails", async () => {
    const directory = await createTemporaryDirectory();
    const source = join(directory, "import.json");
    await writeFile(
      source,
      serializeConversation(createUnicodeConversation("imported")),
      "utf8",
    );
    const delegate = createInMemoryConversationStore();
    const initialEntry = await delegate.save(
      createConversation({ id: "active" }),
    );
    const store = new FailingSaveStore(delegate);
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine: createCompletedEngine([]),
      store,
      initialEntry,
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write(`/import "${source}"\n`);
    await errors.waitFor("import save failure");
    await output.waitFor("You: ", 2);
    input.write("/info\n");
    await output.waitFor("Conversation ID: active");
    await output.waitFor("You: ", 3);
    input.write("/exit\n");
    await running;

    expect(await delegate.get("imported")).toBeUndefined();
    expect(output.read()).toContain("Conversation ID: active");
  });
});

function createUnicodeConversation(id: string): Readonly<Conversation> {
  return createConversation({
    id,
    createdAt: "2026-07-17T08:00:00.000Z",
    messages: [
      {
        id: `${id}-message`,
        role: LLMMessageRole.User,
        content: "Zażółć gęślą jaźń 👋",
        createdAt: "2026-07-17T08:00:01.000Z",
      },
    ],
  });
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agentforge-chat-files-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function tryCreateSymlink(
  target: string,
  path: string,
): Promise<boolean> {
  try {
    await symlink(target, path, "file");
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "EPERM" || error.code === "EACCES")
    ) {
      return false;
    }
    throw error;
  }
}

class FailingSaveStore implements ConversationStore {
  constructor(private readonly delegate: ConversationStore) {}

  save(_conversation: Conversation): Promise<Readonly<ConversationStoreEntry>> {
    return Promise.reject(new Error("import save failure"));
  }

  get(id: string): Promise<Readonly<ConversationStoreEntry> | undefined> {
    return this.delegate.get(id);
  }

  require(id: string): Promise<Readonly<ConversationStoreEntry>> {
    return this.delegate.require(id);
  }

  list(
    options?: ConversationStoreListOptions,
  ): Promise<Readonly<ConversationStoreListResult>> {
    return this.delegate.list(options);
  }

  delete(id: string): Promise<boolean> {
    return this.delegate.delete(id);
  }

  clear(): Promise<void> {
    return this.delegate.clear();
  }
}
