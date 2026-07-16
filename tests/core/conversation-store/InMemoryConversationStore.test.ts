import {
  ConversationNotFoundError,
  ConversationStoreOrder,
  InvalidConversationStoreInputError,
  createInMemoryConversationStore,
} from "@agentforge/core";
import type {
  Conversation,
  ConversationStore,
  ConversationStoreEntry,
  InMemoryConversationStoreOptions,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";

const createdAt = "2026-07-16T10:00:00.000Z";

function mutableConversation(
  id: string,
  updatedAt = createdAt,
  content = `Message for ${id}`,
): Conversation {
  return {
    id,
    createdAt,
    updatedAt,
    messages: [
      {
        id: `${id}-message`,
        role: LLMMessageRole.User,
        content,
        createdAt: updatedAt,
      },
    ],
  };
}

function initialEntry(
  id: string,
  revision = 1,
  savedAt = "2026-07-16T12:00:00.000Z",
): ConversationStoreEntry {
  return { conversation: mutableConversation(id), revision, savedAt };
}

function requireFirst<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("Expected a value.");
  return value;
}

describe("InMemoryConversationStore save and retrieval", () => {
  it("starts at revision one and increments per conversation ID", async () => {
    const store = createInMemoryConversationStore({
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });

    const first = await store.save(mutableConversation("first"));
    const second = await store.save(
      mutableConversation("first", "2026-07-16T10:01:00.000Z"),
    );
    const other = await store.save(mutableConversation("other"));

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(other.revision).toBe(1);
    expect(first.savedAt).toBe("2026-07-16T12:00:00.000Z");
  });

  it("calls the injected clock exactly once for every successful save", async () => {
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-07-16T12:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-07-16T12:01:00.000Z"));
    const store = createInMemoryConversationStore({ now });

    await store.save(mutableConversation("one"));
    await store.save(mutableConversation("two"));
    await store.get("one");
    await store.require("two");
    await store.list();
    await store.delete("one");
    await store.clear();

    expect(now).toHaveBeenCalledTimes(2);
  });

  it("assigns unique revisions to saves invoked in the same turn", async () => {
    const store = createInMemoryConversationStore();

    const first = store.save(mutableConversation("concurrent"));
    const second = store.save(mutableConversation("concurrent"));

    await expect(first).resolves.toMatchObject({ revision: 1 });
    await expect(second).resolves.toMatchObject({ revision: 2 });
  });

  it("rejects invalid dates returned by the clock without saving", async () => {
    const store = createInMemoryConversationStore({
      now: () => new Date(Number.NaN),
    });

    await expect(
      store.save(mutableConversation("invalid-date")),
    ).rejects.toBeInstanceOf(InvalidConversationStoreInputError);
    expect((await store.list()).entries).toHaveLength(0);
  });

  it("preserves a thrown clock error as the cause", async () => {
    const cause = new Error("clock failed");
    const store = createInMemoryConversationStore({
      now: () => {
        throw cause;
      },
    });

    await expect(
      store.save(mutableConversation("clock")),
    ).rejects.toMatchObject({
      cause,
    });
  });

  it("deeply snapshots mutable input without freezing caller data", async () => {
    const nested = { source: { tags: ["original"] } };
    const conversation = mutableConversation("mutable") as Conversation & {
      metadata: typeof nested;
    };
    conversation.metadata = nested;
    const originalMessages = conversation.messages as Array<{
      content: string;
    }>;
    const store = createInMemoryConversationStore();

    const saved = await store.save(conversation);
    requireFirst(originalMessages).content = "changed";
    nested.source.tags.push("changed");
    const loaded = await store.require("mutable");

    expect(Object.isFrozen(conversation)).toBe(false);
    expect(Object.isFrozen(originalMessages)).toBe(false);
    expect(saved).not.toBe(loaded);
    expect(saved.conversation).toBe(loaded.conversation);
    expect(loaded.conversation.messages[0]?.content).toBe(
      "Message for mutable",
    );
    expect(
      (loaded.conversation as Conversation & { metadata: typeof nested })
        .metadata.source.tags,
    ).toEqual(["original"]);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.conversation)).toBe(true);
    expect(Object.isFrozen(loaded.conversation.messages)).toBe(true);
    expect(Object.isFrozen(loaded.conversation.messages[0])).toBe(true);
    expect(
      Object.isFrozen(
        (loaded.conversation as Conversation & { metadata: typeof nested })
          .metadata.source.tags,
      ),
    ).toBe(true);
  });

  it("returns undefined from get and a typed error from require when missing", async () => {
    const store = createInMemoryConversationStore();

    await expect(store.get("missing")).resolves.toBeUndefined();
    await expect(store.require("missing")).rejects.toEqual(
      new ConversationNotFoundError("missing"),
    );
  });

  it.each(["", "   ", 42, null])(
    "rejects malformed lookup ID %#",
    async (id) => {
      const store = createInMemoryConversationStore();

      await expect(store.get(id as string)).rejects.toBeInstanceOf(
        InvalidConversationStoreInputError,
      );
      await expect(store.require(id as string)).rejects.toBeInstanceOf(
        InvalidConversationStoreInputError,
      );
      await expect(store.delete(id as string)).rejects.toBeInstanceOf(
        InvalidConversationStoreInputError,
      );
    },
  );

  it("preserves whitespace around valid lookup IDs", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation(" conversation "));

    await expect(store.get("conversation")).resolves.toBeUndefined();
    await expect(store.require(" conversation ")).resolves.toMatchObject({
      conversation: { id: " conversation " },
    });
  });

  it("retrieves stable metadata without changing the revision", async () => {
    const store = createInMemoryConversationStore({
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });
    await store.save(mutableConversation("stable"));

    const first = await store.get("stable");
    const second = await store.get("stable");

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(second?.revision).toBe(1);
    expect(second?.savedAt).toBe("2026-07-16T12:00:00.000Z");
  });
});

describe("InMemoryConversationStore deletion", () => {
  it("deletes idempotently and restarts revision after deletion", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("deleted"));
    await store.save(mutableConversation("deleted"));

    await expect(store.delete("deleted")).resolves.toBe(true);
    await expect(store.delete("deleted")).resolves.toBe(false);
    await expect(store.get("deleted")).resolves.toBeUndefined();
    await expect(
      store.save(mutableConversation("deleted")),
    ).resolves.toMatchObject({
      revision: 1,
    });
  });

  it("clears all entries and resets revisions", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("one"));
    await store.save(mutableConversation("one"));
    await store.save(mutableConversation("two"));

    await expect(store.clear()).resolves.toBeUndefined();
    expect((await store.list()).entries).toHaveLength(0);
    await expect(store.clear()).resolves.toBeUndefined();
    await expect(store.save(mutableConversation("one"))).resolves.toMatchObject(
      {
        revision: 1,
      },
    );
  });
});

describe("InMemoryConversationStore listing", () => {
  it("returns a frozen empty default result", async () => {
    const result = await createInMemoryConversationStore().list();

    expect(result).toEqual({ entries: [] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entries)).toBe(true);
  });

  it("orders by updated time descending by default with an ID tie-breaker", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("z", "2026-07-16T10:01:00.000Z"));
    await store.save(mutableConversation("b", "2026-07-16T10:02:00.000Z"));
    await store.save(mutableConversation("a", "2026-07-16T10:02:00.000Z"));

    expect(
      (await store.list()).entries.map(({ conversation }) => conversation.id),
    ).toEqual(["a", "b", "z"]);
  });

  it("supports ascending order with the same deterministic tie-breaker", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("z", "2026-07-16T10:02:00.000Z"));
    await store.save(mutableConversation("b", "2026-07-16T10:01:00.000Z"));
    await store.save(mutableConversation("a", "2026-07-16T10:01:00.000Z"));

    const result = await store.list({
      order: ConversationStoreOrder.UpdatedAscending,
    });
    expect(result.entries.map(({ conversation }) => conversation.id)).toEqual([
      "a",
      "b",
      "z",
    ]);
  });

  it("orders by conversation updatedAt instead of savedAt", async () => {
    const dates = [
      new Date("2026-07-16T15:00:00.000Z"),
      new Date("2026-07-16T14:00:00.000Z"),
    ];
    const store = createInMemoryConversationStore({
      now: () => dates.shift() ?? new Date(0),
    });
    await store.save(mutableConversation("older", "2026-07-16T10:01:00.000Z"));
    await store.save(mutableConversation("newer", "2026-07-16T10:02:00.000Z"));

    expect(
      (await store.list()).entries.map(({ conversation }) => conversation.id),
    ).toEqual(["newer", "older"]);
  });

  it("moves a replaced conversation according to its updatedAt", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("one", "2026-07-16T10:01:00.000Z"));
    await store.save(mutableConversation("two", "2026-07-16T10:02:00.000Z"));
    await store.save(mutableConversation("one", "2026-07-16T10:03:00.000Z"));

    expect(
      (await store.list()).entries.map(({ conversation }) => conversation.id),
    ).toEqual(["one", "two"]);
  });

  it("uses the default limit of 50 and accepts the maximum limit", async () => {
    const store = createInMemoryConversationStore();
    for (let index = 0; index < 101; index += 1) {
      await store.save(
        mutableConversation(`conversation-${String(index).padStart(3, "0")}`),
      );
    }

    const defaultPage = await store.list();
    const maximumPage = await store.list({ limit: 100 });

    expect(defaultPage.entries).toHaveLength(50);
    expect(defaultPage.nextCursor).toEqual(expect.any(String));
    expect(maximumPage.entries).toHaveLength(100);
    expect(maximumPage.nextCursor).toEqual(expect.any(String));
  });

  it("paginates without duplicates and omits the final cursor", async () => {
    const store = createInMemoryConversationStore();
    for (const id of ["a", "b", "c", "d", "e"]) {
      await store.save(mutableConversation(id));
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
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, 101])(
    "rejects invalid limit %#",
    async (limit) => {
      await expect(
        createInMemoryConversationStore().list({ limit }),
      ).rejects.toBeInstanceOf(InvalidConversationStoreInputError);
    },
  );

  it.each([
    { cursor: "" },
    { cursor: 42 as unknown as string },
    { order: "unknown" as ConversationStoreOrder },
  ])("rejects invalid list options %#", async (options) => {
    await expect(
      createInMemoryConversationStore().list(options),
    ).rejects.toBeInstanceOf(InvalidConversationStoreInputError);
  });

  it("rejects malformed cursors and cursors for another order", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("a"));
    await store.save(mutableConversation("b"));
    const first = await store.list({ limit: 1 });

    await expect(store.list({ cursor: "not-a-cursor" })).rejects.toBeInstanceOf(
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

  it("does not list deleted entries and freezes listed entries", async () => {
    const store = createInMemoryConversationStore();
    await store.save(mutableConversation("kept"));
    await store.save(mutableConversation("deleted"));
    await store.delete("deleted");

    const result = await store.list();

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.conversation.id).toBe("kept");
    expect(Object.isFrozen(result.entries[0])).toBe(true);
    expect(Object.isFrozen(result.entries[0]?.conversation)).toBe(true);
  });
});

describe("InMemoryConversationStore initial entries", () => {
  it("preserves initial metadata, snapshots input, and does not call now", async () => {
    const now = vi.fn<() => Date>(() => new Date());
    const entry = initialEntry("initial", 7, "2026-07-16T13:00:00.000Z");
    const options: InMemoryConversationStoreOptions = {
      now,
      initialEntries: [entry],
    };
    const store: ConversationStore = createInMemoryConversationStore(options);
    requireFirst(
      entry.conversation.messages as Array<{ content: string }>,
    ).content = "changed";

    const loaded = await store.require("initial");

    expect(loaded.revision).toBe(7);
    expect(loaded.savedAt).toBe("2026-07-16T13:00:00.000Z");
    expect(loaded.conversation.messages[0]?.content).toBe(
      "Message for initial",
    );
    expect(now).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs", () => {
    expect(() =>
      createInMemoryConversationStore({
        initialEntries: [initialEntry("duplicate"), initialEntry("duplicate")],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: [
          'initialEntries contains duplicate conversation ID "duplicate"',
        ],
      }),
    );
  });

  it.each([
    ["revision", { ...initialEntry("invalid"), revision: 0 }],
    ["savedAt", { ...initialEntry("invalid"), savedAt: "invalid" }],
    ["conversation", { ...initialEntry("invalid"), conversation: { id: "" } }],
  ])("rejects an invalid initial %s", (_field, entry) => {
    expect(() =>
      createInMemoryConversationStore({
        initialEntries: [entry as ConversationStoreEntry],
      }),
    ).toThrow(InvalidConversationStoreInputError);
  });
});
