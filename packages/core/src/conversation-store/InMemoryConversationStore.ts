import type { Conversation } from "../conversation/index.js";
import type { ConversationStore } from "./ConversationStore.js";
import type { ConversationStoreEntry } from "./ConversationStoreEntry.js";
import {
  type ConversationStoreListOptions,
  ConversationStoreOrder,
} from "./ConversationStoreListOptions.js";
import type { ConversationStoreListResult } from "./ConversationStoreListResult.js";
import type { InMemoryConversationStoreOptions } from "./createInMemoryConversationStore.js";
import {
  ConversationNotFoundError,
  InvalidConversationStoreInputError,
} from "./errors/index.js";
import { snapshotConversation } from "./internal/snapshotConversation.js";
import {
  isRecord,
  validateConversationId,
  validateConversationStoreListOptions,
  validateRevision,
  validateSavedAt,
} from "./internal/validateConversationStoreInput.js";

interface CursorPayload {
  readonly updatedAt: string;
  readonly id: string;
  readonly order: ConversationStoreOrder;
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly entries = new Map<
    string,
    Readonly<ConversationStoreEntry>
  >();
  private readonly now: () => Date;

  constructor(options?: InMemoryConversationStoreOptions) {
    const value: unknown = options;
    if (value !== undefined && !isRecord(value)) {
      throw new InvalidConversationStoreInputError([
        "options must be an object when provided",
      ]);
    }
    if (options?.now !== undefined && typeof options.now !== "function") {
      throw new InvalidConversationStoreInputError(["now must be a function"]);
    }
    if (
      options?.initialEntries !== undefined &&
      !Array.isArray(options.initialEntries)
    ) {
      throw new InvalidConversationStoreInputError([
        "initialEntries must be an array when provided",
      ]);
    }

    this.now = options?.now ?? (() => new Date());
    for (const [index, entry] of (options?.initialEntries ?? []).entries()) {
      const snapshot = snapshotInitialEntry(entry, index);
      const id = snapshot.conversation.id;
      if (this.entries.has(id)) {
        throw new InvalidConversationStoreInputError([
          `initialEntries contains duplicate conversation ID "${id}"`,
        ]);
      }
      this.entries.set(id, snapshot);
    }
  }

  async save(
    conversation: Conversation,
  ): Promise<Readonly<ConversationStoreEntry>> {
    const conversationSnapshot = snapshotConversation(conversation);
    const savedAt = this.getCurrentTimestamp();
    const revision =
      (this.entries.get(conversationSnapshot.id)?.revision ?? 0) + 1;
    const storedEntry = freezeEntry({
      conversation: conversationSnapshot,
      savedAt,
      revision,
    });
    this.entries.set(conversationSnapshot.id, storedEntry);
    return copyEntry(storedEntry);
  }

  async get(
    conversationId: string,
  ): Promise<Readonly<ConversationStoreEntry> | undefined> {
    const id = validateConversationId(conversationId);
    const entry = this.entries.get(id);
    return entry === undefined ? undefined : copyEntry(entry);
  }

  async require(
    conversationId: string,
  ): Promise<Readonly<ConversationStoreEntry>> {
    const id = validateConversationId(conversationId);
    const entry = this.entries.get(id);
    if (entry === undefined) throw new ConversationNotFoundError(id);
    return copyEntry(entry);
  }

  async list(
    options?: ConversationStoreListOptions,
  ): Promise<Readonly<ConversationStoreListResult>> {
    const validated = validateConversationStoreListOptions(options);
    const sorted = [...this.entries.values()].sort((left, right) =>
      compareEntries(left, right, validated.order),
    );
    const start =
      validated.cursor === undefined
        ? 0
        : findCursorStart(sorted, validated.cursor, validated.order);
    const page = sorted.slice(start, start + validated.limit);
    const entries = Object.freeze(page.map(copyEntry));

    if (start + page.length >= sorted.length || page.length === 0) {
      return Object.freeze({ entries });
    }

    const last = page.at(-1) as Readonly<ConversationStoreEntry>;
    return Object.freeze({
      entries,
      nextCursor: encodeCursor({
        updatedAt: last.conversation.updatedAt,
        id: last.conversation.id,
        order: validated.order,
      }),
    });
  }

  async delete(conversationId: string): Promise<boolean> {
    return this.entries.delete(validateConversationId(conversationId));
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  private getCurrentTimestamp(): string {
    let date: unknown;
    try {
      date = this.now();
    } catch (error) {
      throw new InvalidConversationStoreInputError(
        ["now failed to return the current date"],
        { cause: error },
      );
    }
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new InvalidConversationStoreInputError([
        "now must return a valid Date",
      ]);
    }
    return date.toISOString();
  }
}

function snapshotInitialEntry(
  entry: ConversationStoreEntry,
  index: number,
): Readonly<ConversationStoreEntry> {
  if (!isRecord(entry)) {
    throw new InvalidConversationStoreInputError([
      `initialEntries[${index}] must be an object`,
    ]);
  }
  const conversation = snapshotConversation(entry.conversation as Conversation);
  const savedAt = validateSavedAt(
    entry.savedAt,
    `initialEntries[${index}].savedAt`,
  );
  const revision = validateRevision(
    entry.revision,
    `initialEntries[${index}].revision`,
  );
  return freezeEntry({ conversation, savedAt, revision });
}

function freezeEntry(
  entry: ConversationStoreEntry,
): Readonly<ConversationStoreEntry> {
  return Object.freeze({
    conversation: entry.conversation,
    savedAt: entry.savedAt,
    revision: entry.revision,
  });
}

function copyEntry(
  entry: Readonly<ConversationStoreEntry>,
): Readonly<ConversationStoreEntry> {
  return freezeEntry(entry);
}

function compareEntries(
  left: Readonly<ConversationStoreEntry>,
  right: Readonly<ConversationStoreEntry>,
  order: ConversationStoreOrder,
): number {
  const leftTime = Date.parse(left.conversation.updatedAt);
  const rightTime = Date.parse(right.conversation.updatedAt);
  if (leftTime !== rightTime) {
    return order === ConversationStoreOrder.UpdatedDescending
      ? rightTime - leftTime
      : leftTime - rightTime;
  }
  return left.conversation.id.localeCompare(right.conversation.id);
}

function findCursorStart(
  entries: readonly Readonly<ConversationStoreEntry>[],
  cursor: string,
  order: ConversationStoreOrder,
): number {
  const payload = decodeCursor(cursor);
  if (payload.order !== order) {
    throw new InvalidConversationStoreInputError([
      "cursor does not match the selected order",
    ]);
  }
  const index = entries.findIndex(
    ({ conversation }) =>
      conversation.id === payload.id &&
      conversation.updatedAt === payload.updatedAt,
  );
  if (index < 0) {
    throw new InvalidConversationStoreInputError([
      "cursor does not reference a stored conversation",
    ]);
  }
  return index + 1;
}

function encodeCursor(payload: CursorPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error("Invalid encoding");
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !isRecord(payload) ||
      typeof payload.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(payload.updatedAt)) ||
      typeof payload.id !== "string" ||
      payload.id.trim().length === 0 ||
      !Object.values(ConversationStoreOrder).includes(payload.order as never)
    ) {
      throw new Error("Invalid payload");
    }
    return payload as unknown as CursorPayload;
  } catch (error) {
    throw new InvalidConversationStoreInputError(["cursor is malformed"], {
      cause: error,
    });
  }
}
