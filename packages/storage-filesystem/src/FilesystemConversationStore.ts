import type { Dirent } from "node:fs";
import { join } from "node:path";
import {
  ConversationNotFoundError,
  ConversationStoreOrder,
  InvalidConversationStoreInputError,
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
import type { FilesystemConversationStoreOptions } from "./FilesystemConversationStoreOptions.js";
import {
  ConversationStoreInitializationError,
  ConversationStoreIoError,
} from "./errors/index.js";
import {
  BACKUP_FILE_PATTERN,
  CONVERSATIONS_DIRECTORY_NAME,
  DEFAULT_LIST_LIMIT,
  MAXIMUM_LIST_LIMIT,
  TEMPORARY_FILE_PATTERN,
} from "./internal/constants.js";
import {
  filesystemOperations,
  hasErrorCode,
  writeFileAtomically,
} from "./internal/createAtomicFileWriter.js";
import {
  decodeConversationFilename,
  encodeConversationFilename,
} from "./internal/encodeConversationFilename.js";
import { readConversationEntryFile } from "./internal/readConversationEntryFile.js";
import {
  type ValidatedFilesystemConversationStoreOptions,
  validateFilesystemConversationStoreOptions,
} from "./internal/validateFilesystemConversationStoreOptions.js";

interface CursorPayload {
  readonly updatedAt: string;
  readonly id: string;
  readonly order: ConversationStoreOrder;
}

interface ValidatedListOptions {
  readonly limit: number;
  readonly cursor: string | undefined;
  readonly order: ConversationStoreOrder;
}

export class FilesystemConversationStore implements ConversationStore {
  private readonly options: Readonly<ValidatedFilesystemConversationStoreOptions>;
  private readonly conversationsDirectory: string;
  private readonly writeQueues = new Map<string, Promise<void>>();
  private initialization: Promise<void> | undefined;

  constructor(options: FilesystemConversationStoreOptions) {
    this.options = validateFilesystemConversationStoreOptions(options);
    this.conversationsDirectory = join(
      this.options.directory,
      CONVERSATIONS_DIRECTORY_NAME,
    );
  }

  async save(
    conversation: Conversation,
  ): Promise<Readonly<ConversationStoreEntry>> {
    const conversationSnapshot = snapshotConversation(conversation);
    return this.enqueueWrite(conversationSnapshot.id, async () => {
      await this.ensureInitialized();
      const existing = await this.getExistingEntry(conversationSnapshot.id);
      const entry = Object.freeze({
        conversation: conversationSnapshot,
        savedAt: this.getCurrentTimestamp(),
        revision: (existing?.revision ?? 0) + 1,
      });
      const serialized = serializeConversationStoreEntry(entry, {
        pretty: this.options.pretty,
      });
      await writeFileAtomically(
        this.getConversationPath(conversationSnapshot.id),
        serialized,
      );
      return entry;
    });
  }

  async get(
    conversationId: string,
  ): Promise<Readonly<ConversationStoreEntry> | undefined> {
    const id = validateConversationId(conversationId);
    await this.ensureInitialized();
    return this.getExistingEntry(id);
  }

  async require(
    conversationId: string,
  ): Promise<Readonly<ConversationStoreEntry>> {
    const id = validateConversationId(conversationId);
    const entry = await this.get(id);
    if (entry === undefined) throw new ConversationNotFoundError(id);
    return entry;
  }

  async list(
    options?: ConversationStoreListOptions,
  ): Promise<Readonly<ConversationStoreListResult>> {
    const validated = validateListOptions(options);
    await this.ensureInitialized();
    const entries = await this.readAllEntries();
    entries.sort((left, right) => compareEntries(left, right, validated.order));
    const start =
      validated.cursor === undefined
        ? 0
        : findCursorStart(entries, validated.cursor, validated.order);
    const page = entries.slice(start, start + validated.limit);
    const frozenEntries = Object.freeze([...page]);

    if (page.length === 0 || start + page.length >= entries.length) {
      return Object.freeze({ entries: frozenEntries });
    }

    const last = page.at(-1) as Readonly<ConversationStoreEntry>;
    return Object.freeze({
      entries: frozenEntries,
      nextCursor: encodeCursor({
        updatedAt: last.conversation.updatedAt,
        id: last.conversation.id,
        order: validated.order,
      }),
    });
  }

  async delete(conversationId: string): Promise<boolean> {
    const id = validateConversationId(conversationId);
    return this.enqueueWrite(id, async () => {
      await this.ensureInitialized();
      const filePath = this.getConversationPath(id);
      try {
        await filesystemOperations.unlink(filePath);
        return true;
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) return false;
        throw new ConversationStoreIoError("delete", filePath, {
          cause: error,
        });
      }
    });
  }

  async clear(): Promise<void> {
    await Promise.all([...this.writeQueues.values()]);
    await this.ensureInitialized();
    let directoryEntries: Dirent<string>[];
    try {
      directoryEntries = await filesystemOperations.readdir(
        this.conversationsDirectory,
        { withFileTypes: true },
      );
    } catch (error) {
      throw new ConversationStoreIoError("clear", this.conversationsDirectory, {
        cause: error,
      });
    }

    for (const directoryEntry of directoryEntries) {
      if (!directoryEntry.isFile()) continue;
      const filename = directoryEntry.name;
      if (
        decodeConversationFilename(filename) === undefined &&
        !TEMPORARY_FILE_PATTERN.test(filename) &&
        !BACKUP_FILE_PATTERN.test(filename)
      ) {
        continue;
      }
      const filePath = join(this.conversationsDirectory, filename);
      try {
        await filesystemOperations.unlink(filePath);
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) continue;
        throw new ConversationStoreIoError("clear", filePath, { cause: error });
      }
    }
  }

  private ensureInitialized(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    try {
      await filesystemOperations.mkdir(this.options.directory, {
        recursive: true,
        mode: 0o700,
      });
      await assertDirectory(this.options.directory, "configured root path");
      await filesystemOperations.mkdir(this.conversationsDirectory, {
        recursive: true,
        mode: 0o700,
      });
      await assertDirectory(this.conversationsDirectory, "conversations path");
    } catch (error) {
      if (error instanceof ConversationStoreInitializationError) throw error;
      throw new ConversationStoreInitializationError(
        `Conversation store could not initialize "${this.options.directory}".`,
        { cause: error },
      );
    }
  }

  private async getExistingEntry(
    conversationId: string,
  ): Promise<Readonly<ConversationStoreEntry> | undefined> {
    const filePath = this.getConversationPath(conversationId);
    try {
      const stats = await filesystemOperations.lstat(filePath);
      if (!stats.isFile()) {
        throw new ConversationStoreIoError("read", filePath, {
          cause: new Error("Conversation path is not a regular file."),
        });
      }
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return undefined;
      if (error instanceof ConversationStoreIoError) throw error;
      throw new ConversationStoreIoError("read", filePath, { cause: error });
    }

    try {
      return await readConversationEntryFile(filePath, conversationId);
    } catch (error) {
      if (
        error instanceof ConversationStoreIoError &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  private async readAllEntries(): Promise<Readonly<ConversationStoreEntry>[]> {
    let directoryEntries: Dirent<string>[];
    try {
      directoryEntries = await filesystemOperations.readdir(
        this.conversationsDirectory,
        { withFileTypes: true },
      );
    } catch (error) {
      throw new ConversationStoreIoError("list", this.conversationsDirectory, {
        cause: error,
      });
    }

    const entries: Readonly<ConversationStoreEntry>[] = [];
    for (const directoryEntry of directoryEntries) {
      if (!directoryEntry.isFile()) continue;
      const conversationId = decodeConversationFilename(directoryEntry.name);
      if (conversationId === undefined) continue;
      entries.push(
        await readConversationEntryFile(
          join(this.conversationsDirectory, directoryEntry.name),
          conversationId,
        ),
      );
    }
    return entries;
  }

  private getConversationPath(conversationId: string): string {
    return join(
      this.conversationsDirectory,
      encodeConversationFilename(conversationId),
    );
  }

  private getCurrentTimestamp(): string {
    let value: unknown;
    try {
      value = this.options.now();
    } catch (error) {
      throw new InvalidConversationStoreInputError(
        ["now failed to return the current date"],
        { cause: error },
      );
    }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new InvalidConversationStoreInputError([
        "now must return a valid Date",
      ]);
    }
    return value.toISOString();
  }

  private enqueueWrite<T>(
    conversationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.writeQueues.get(conversationId) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.writeQueues.set(conversationId, settled);
    void settled.finally(() => {
      if (this.writeQueues.get(conversationId) === settled) {
        this.writeQueues.delete(conversationId);
      }
    });
    return result;
  }
}

async function assertDirectory(filePath: string, label: string): Promise<void> {
  const stats = await filesystemOperations.lstat(filePath);
  if (!stats.isDirectory()) {
    throw new ConversationStoreInitializationError(
      `Conversation store ${label} "${filePath}" is not a directory.`,
    );
  }
}

function snapshotConversation(
  conversation: Conversation,
): Readonly<Conversation> {
  try {
    return deserializeConversation(serializeConversation(conversation));
  } catch (error) {
    throw new InvalidConversationStoreInputError(
      ["conversation must be valid"],
      { cause: error },
    );
  }
}

function validateConversationId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConversationStoreInputError([
      "conversationId must be a non-empty string",
    ]);
  }
  return value;
}

function validateListOptions(
  options: ConversationStoreListOptions | undefined,
): ValidatedListOptions {
  if (
    options !== undefined &&
    (typeof options !== "object" || options === null || Array.isArray(options))
  ) {
    throw new InvalidConversationStoreInputError([
      "options must be an object when provided",
    ]);
  }
  const value = options as Record<string, unknown> | undefined;
  const limit = value?.limit ?? DEFAULT_LIST_LIMIT;
  const cursor = value?.cursor;
  const order = value?.order ?? ConversationStoreOrder.UpdatedDescending;
  const details: string[] = [];
  if (
    typeof limit !== "number" ||
    !Number.isFinite(limit) ||
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    details.push("limit must be a positive finite integer");
  } else if (limit > MAXIMUM_LIST_LIMIT) {
    details.push(`limit must not exceed ${MAXIMUM_LIST_LIMIT}`);
  }
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || cursor.trim().length === 0)
  ) {
    details.push("cursor must be a non-empty string when provided");
  }
  if (!Object.values(ConversationStoreOrder).includes(order as never)) {
    details.push("order must be a valid ConversationStoreOrder value");
  }
  if (details.length > 0) throw new InvalidConversationStoreInputError(details);
  return {
    limit: limit as number,
    cursor: cursor as string | undefined,
    order: order as ConversationStoreOrder,
  };
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

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error("Invalid encoding");
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor)
      throw new Error("Non-canonical encoding");
    const payload: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      !("updatedAt" in payload) ||
      typeof payload.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(payload.updatedAt)) ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      payload.id.trim().length === 0 ||
      !("order" in payload) ||
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
