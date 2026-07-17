import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  ConversationStoreError,
  ConversationTurnAbortedError,
  createConversation,
  createInMemoryConversationStore,
} from "@agentforge/core";
import type {
  Conversation,
  ConversationEngine,
  ConversationStore,
  ConversationStoreEntry,
  ConversationStoreListOptions,
  ConversationStoreListResult,
  ConversationTurnInput,
} from "@agentforge/core";
import { createFilesystemConversationStore } from "@agentforge/storage-filesystem";
import { afterEach, describe, expect, it } from "vitest";
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

describe("ChatApplication persistence", () => {
  it("saves completed turns, explicit saves, deletion, listing, and info", async () => {
    const conversation = createConversation({ id: "active" });
    const store = createInMemoryConversationStore();
    const initialEntry = await store.save(conversation);
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const turnInputs: ConversationTurnInput[] = [];
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine: createCompletedEngine(turnInputs),
      store,
      initialEntry,
      dataDirectory: "C:\\durable-chat",
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Hello\n");
    await output.waitFor("Assistant: Answer 1\nYou: ");
    input.write("/save\n");
    await output.waitFor("Revision: 3\nYou: ");
    input.write("/list\n");
    await output.waitFor("* active");
    await output.waitFor("You: ", 4);
    input.write("/info\n");
    await output.waitFor("Data directory: C:\\durable-chat\nYou: ");
    input.write("/delete active\n");
    await output.waitFor("now unsaved.\nYou: ");
    input.write("/info\n");
    await output.waitFor("Revision: unsaved\n");
    await output.waitFor("You: ", 7);
    input.write("/save\n");
    await output.waitFor("Revision: 1\nYou: ");
    input.write("/exit\n");
    await running;

    expect(turnInputs).toHaveLength(1);
    expect((await store.require("active")).revision).toBe(1);
    expect((await store.require("active")).conversation.messages).toHaveLength(
      2,
    );
    expect(output.read()).toContain(
      "Conversation saved.\nID: active\nRevision: 3",
    );
    expect(output.read()).toContain("Conversation deleted: active");
    expect(output.read()).toContain("Conversation ID: active");
    expect(output.read()).toContain("Messages: 2");
    expect(output.read()).toContain("Revision: unsaved");
    expect(errors.read()).toBe("");
  });

  it("loads without saving and reset adopts only a saved conversation", async () => {
    const store = createInMemoryConversationStore();
    const active = await store.save(createConversation({ id: "active" }));
    const stored = await store.save(createConversation({ id: "stored" }));
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine: createCompletedEngine([]),
      store,
      initialEntry: active,
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write("/load stored\n");
    await output.waitFor("Updated:");
    await output.waitFor("You: ", 2);
    expect((await store.require("stored")).revision).toBe(stored.revision);
    input.write("/reset\n");
    await output.waitFor("Conversation reset.\n");
    await output.waitFor("Revision: 1\nYou: ");
    input.write("/exit\n");
    await running;

    expect(output.read()).toContain("Conversation loaded.\nID: stored");
    expect(errors.read()).toBe("");
    expect((await store.list()).entries).toHaveLength(3);
  });

  it("keeps the previous conversation when turn persistence fails", async () => {
    const delegate = createInMemoryConversationStore();
    const initialEntry = await delegate.save(
      createConversation({ id: "active" }),
    );
    const store = new ControlledStore(delegate);
    store.failNextSave = true;
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const turnInputs: ConversationTurnInput[] = [];
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine: createCompletedEngine(turnInputs),
      store,
      initialEntry,
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write("First\n");
    await errors.waitFor("previous conversation remains active.");
    await output.waitFor("You: ", 2);
    input.write("Second\n");
    await output.waitFor("Assistant: Answer 2\nYou: ");
    input.write("/exit\n");
    await running;

    expect(turnInputs[1]?.conversation.messages).toHaveLength(0);
    const persisted = await delegate.require("active");
    expect(persisted.conversation.messages).toHaveLength(2);
    expect(persisted.revision).toBe(2);
    expect(errors.read()).toContain("could not be persisted");
    expect(errors.read()).toContain("Conversation storage failed");
  });

  it("preserves active state after failed reset and failed load", async () => {
    const delegate = createInMemoryConversationStore();
    const initialEntry = await delegate.save(
      createConversation({ id: "active" }),
    );
    const store = new ControlledStore(delegate);
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
    store.failNextSave = true;
    input.write("/reset\n");
    await errors.waitFor("controlled save failure");
    await output.waitFor("You: ", 2);
    input.write("/load missing\n");
    await errors.waitFor('Conversation "missing" was not found.');
    await output.waitFor("You: ", 3);
    input.write("/info\n");
    await output.waitFor("Conversation ID: active");
    await output.waitFor("You: ", 4);
    input.write("/exit\n");
    await running;

    expect(output.read()).toContain("Conversation ID: active");
    expect(output.read()).toContain("Revision: 1");
  });

  it("does not send malformed commands or failed provider turns to storage", async () => {
    const store = createInMemoryConversationStore();
    const initialEntry = await store.save(createConversation({ id: "active" }));
    let calls = 0;
    const engine = {
      streamTurn() {
        calls += 1;
        return {
          async *[Symbol.asyncIterator]() {
            yield* [];
            throw new Error("provider failure");
          },
        };
      },
    } as unknown as ConversationEngine;
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine,
      store,
      initialEntry,
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write("/unknown\n");
    await errors.waitFor("Type /help");
    await output.waitFor("You: ", 2);
    input.write("Hello\n");
    await errors.waitFor("provider failure");
    await output.waitFor("You: ", 3);
    input.write("/exit\n");
    await running;

    expect(calls).toBe(1);
    expect((await store.require("active")).revision).toBe(1);
  });

  it("does not persist a cancelled partial turn", async () => {
    const store = createInMemoryConversationStore();
    const initialEntry = await store.save(createConversation({ id: "active" }));
    const engine = {
      async *streamTurn(turn: ConversationTurnInput) {
        yield {
          type: "delta",
          delta: "partial",
          content: "partial",
          provider: "ollama",
          model: "model",
          profile: "interactive-chat",
        } as const;
        await waitForAbort(turn.request?.signal);
        throw new ConversationTurnAbortedError("provider-execution", {
          reason: turn.request?.signal?.reason,
        });
      },
    } as unknown as ConversationEngine;
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const application = createTestApplication({
      input,
      output: output.stream,
      errorOutput: errors.stream,
      engine,
      store,
      initialEntry,
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Cancel me\n");
    await output.waitFor("Assistant: partial");
    application.cancelActiveTurn(new Error("test cancellation"));
    await output.waitFor("Response cancelled.\nYou: ");
    input.write("/exit\n");
    await running;

    expect((await store.require("active")).revision).toBe(1);
    expect((await store.require("active")).conversation.messages).toHaveLength(
      0,
    );
    expect(errors.read()).toBe("");
  });

  it("persists across filesystem-store restarts and continues revisions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentforge-chat-restart-"));
    temporaryDirectories.push(directory);
    const firstStore = createFilesystemConversationStore({ directory });
    const firstInitial = await firstStore.save(
      createConversation({ id: "persisted" }),
    );
    const firstInput = new PassThrough();
    const firstOutput = captureStream();
    const firstApplication = createTestApplication({
      input: firstInput,
      output: firstOutput.stream,
      errorOutput: captureStream().stream,
      engine: createCompletedEngine([]),
      store: firstStore,
      initialEntry: firstInitial,
      dataDirectory: directory,
    });

    const firstRun = firstApplication.run();
    await firstOutput.waitFor("You: ");
    firstInput.write("First session\n");
    await firstOutput.waitFor("You: ", 2);
    firstInput.write("/exit\n");
    await firstRun;

    const secondStore = createFilesystemConversationStore({ directory });
    const secondInitial = await secondStore.save(
      createConversation({ id: "fresh-session" }),
    );
    const secondInput = new PassThrough();
    const secondOutput = captureStream();
    const secondApplication = createTestApplication({
      input: secondInput,
      output: secondOutput.stream,
      errorOutput: captureStream().stream,
      engine: createCompletedEngine([]),
      store: secondStore,
      initialEntry: secondInitial,
      dataDirectory: directory,
    });

    const secondRun = secondApplication.run();
    await secondOutput.waitFor("You: ");
    secondInput.write("/list\n");
    await secondOutput.waitFor("persisted");
    await secondOutput.waitFor("You: ", 2);
    secondInput.write("/load persisted\n");
    await secondOutput.waitFor("Conversation loaded.");
    await secondOutput.waitFor("You: ", 3);
    secondInput.write("Second session\n");
    await secondOutput.waitFor("You: ", 4);
    secondInput.write("/exit\n");
    await secondRun;

    const persisted = await secondStore.require("persisted");
    expect(persisted.revision).toBe(3);
    expect(persisted.conversation.messages).toHaveLength(4);
  });
});

class ControlledStore implements ConversationStore {
  failNextSave = false;

  constructor(private readonly delegate: ConversationStore) {}

  async save(
    conversation: Conversation,
  ): Promise<Readonly<ConversationStoreEntry>> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new ConversationStoreError("controlled save failure");
    }
    return this.delegate.save(conversation);
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

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) =>
    signal?.addEventListener("abort", () => resolve(), { once: true }),
  );
}
