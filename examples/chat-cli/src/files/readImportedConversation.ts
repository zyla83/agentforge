import { lstat, readFile } from "node:fs/promises";
import type { Conversation } from "@agentforge/core";
import { deserializeConversation } from "@agentforge/core";
import { ChatFileOperationError } from "./ChatFileOperationError.js";
import { resolveUserFilePath } from "./resolveUserFilePath.js";

export interface ImportedConversation {
  readonly conversation: Readonly<Conversation>;
  readonly filePath: string;
}

export async function readImportedConversation(
  filePath: string,
): Promise<Readonly<ImportedConversation>> {
  const resolvedPath = resolveUserFilePath(filePath);
  let status: Awaited<ReturnType<typeof lstat>>;
  try {
    status = await lstat(resolvedPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new ChatFileOperationError(
        `Import file was not found: ${resolvedPath}`,
        resolvedPath,
        { cause: error },
      );
    }
    throw new ChatFileOperationError(
      `Import file could not be inspected: ${resolvedPath}`,
      resolvedPath,
      { cause: error },
    );
  }
  if (status.isSymbolicLink()) {
    throw new ChatFileOperationError(
      `Import path must not be a symbolic link: ${resolvedPath}`,
      resolvedPath,
    );
  }
  if (!status.isFile()) {
    throw new ChatFileOperationError(
      `Import path must be a regular file: ${resolvedPath}`,
      resolvedPath,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(resolvedPath);
  } catch (error) {
    throw new ChatFileOperationError(
      `Import file could not be read: ${resolvedPath}`,
      resolvedPath,
      { cause: error },
    );
  }

  let serialized: string;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ChatFileOperationError(
      `Import file is not valid UTF-8: ${resolvedPath}`,
      resolvedPath,
      { cause: error },
    );
  }

  return Object.freeze({
    conversation: deserializeConversation(serialized),
    filePath: resolvedPath,
  });
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
