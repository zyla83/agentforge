import {
  ConversationSerializationError,
  deserializeConversationStoreEntry,
} from "@agentforge/core";
import type { ConversationStoreEntry } from "@agentforge/core";
import {
  ConversationStoreFileCorruptedError,
  ConversationStoreIoError,
} from "../errors/index.js";
import { filesystemOperations } from "./createAtomicFileWriter.js";

export async function readConversationEntryFile(
  filePath: string,
  expectedConversationId: string,
): Promise<Readonly<ConversationStoreEntry>> {
  let bytes: Uint8Array;
  try {
    bytes = await filesystemOperations.readFile(filePath);
  } catch (error) {
    throw new ConversationStoreIoError("read", filePath, { cause: error });
  }

  let serialized: string;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ConversationStoreFileCorruptedError(
      filePath,
      expectedConversationId,
      { cause: error },
    );
  }

  let entry: Readonly<ConversationStoreEntry>;
  try {
    entry = deserializeConversationStoreEntry(serialized);
  } catch (error) {
    if (!(error instanceof ConversationSerializationError)) throw error;
    throw new ConversationStoreFileCorruptedError(
      filePath,
      expectedConversationId,
      { cause: error },
    );
  }

  if (entry.conversation.id !== expectedConversationId) {
    throw new ConversationStoreFileCorruptedError(
      filePath,
      expectedConversationId,
    );
  }
  return entry;
}
