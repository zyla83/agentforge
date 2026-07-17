import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Conversation } from "@agentforge/core";
import { serializeConversation } from "@agentforge/core";
import { ChatFileOperationError } from "./ChatFileOperationError.js";
import { resolveUserFilePath } from "./resolveUserFilePath.js";

export async function writeExportedConversation(
  filePath: string,
  conversation: Conversation,
): Promise<string> {
  const resolvedPath = resolveUserFilePath(filePath);
  const directory = dirname(resolvedPath);
  try {
    await mkdir(directory, { recursive: true });
    await validateDestination(resolvedPath);
    await writeAtomically(
      resolvedPath,
      serializeConversation(conversation, { pretty: true }),
    );
    return resolvedPath;
  } catch (error) {
    if (error instanceof ChatFileOperationError) throw error;
    throw new ChatFileOperationError(
      `Conversation could not be exported to: ${resolvedPath}`,
      resolvedPath,
      { cause: error },
    );
  }
}

async function validateDestination(filePath: string): Promise<void> {
  try {
    const status = await lstat(filePath);
    if (status.isSymbolicLink()) {
      throw new ChatFileOperationError(
        `Export destination must not be a symbolic link: ${filePath}`,
        filePath,
      );
    }
    if (!status.isFile()) {
      throw new ChatFileOperationError(
        `Export destination must be a regular file: ${filePath}`,
        filePath,
      );
    }
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return;
    throw error;
  }
}

async function writeAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  const directory = dirname(filePath);
  const suffix = randomUUID();
  const name = basename(filePath);
  const temporaryPath = join(directory, `.${name}.${suffix}.tmp`);
  const backupPath = join(directory, `.${name}.${suffix}.bak`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await replaceFile(temporaryPath, filePath, backupPath);
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function replaceFile(
  temporaryPath: string,
  finalPath: string,
  backupPath: string,
): Promise<void> {
  try {
    await rename(temporaryPath, finalPath);
    return;
  } catch (error) {
    if (!isReplacementConflict(error)) throw error;
  }

  try {
    await rename(finalPath, backupPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      await rename(temporaryPath, finalPath);
      return;
    }
    throw error;
  }

  try {
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await rename(backupPath, finalPath).catch(() => undefined);
    throw error;
  }
  await unlink(backupPath).catch(() => undefined);
}

function isReplacementConflict(error: unknown): boolean {
  return (
    hasErrorCode(error, "EEXIST") ||
    hasErrorCode(error, "EPERM") ||
    hasErrorCode(error, "EACCES")
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
