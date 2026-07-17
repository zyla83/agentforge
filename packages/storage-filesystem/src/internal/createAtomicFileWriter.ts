import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname } from "node:path";
import { ConversationStoreIoError } from "../errors/index.js";

export const filesystemOperations = {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
};

export async function writeFileAtomically(
  finalPath: string,
  contents: string,
): Promise<void> {
  const directory = dirname(finalPath);
  const encodedName = basename(finalPath, ".json");
  const suffix = randomUUID();
  const temporaryPath = `${directory}/.${encodedName}.${suffix}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await filesystemOperations.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await replaceFile(temporaryPath, finalPath, encodedName, suffix);
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    throw new ConversationStoreIoError("write", finalPath, { cause: error });
  } finally {
    await filesystemOperations.unlink(temporaryPath).catch((error: unknown) => {
      if (!hasErrorCode(error, "ENOENT")) return undefined;
      return undefined;
    });
  }
}

async function replaceFile(
  temporaryPath: string,
  finalPath: string,
  encodedName: string,
  suffix: string,
): Promise<void> {
  try {
    await filesystemOperations.rename(temporaryPath, finalPath);
    return;
  } catch (error) {
    if (!isReplacementConflict(error)) throw error;
  }

  const backupPath = `${dirname(finalPath)}/.${encodedName}.${suffix}.bak`;
  try {
    await filesystemOperations.rename(finalPath, backupPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      await filesystemOperations.rename(temporaryPath, finalPath);
      return;
    }
    throw error;
  }

  try {
    await filesystemOperations.rename(temporaryPath, finalPath);
  } catch (error) {
    await filesystemOperations
      .rename(backupPath, finalPath)
      .catch(() => undefined);
    throw error;
  }

  await filesystemOperations.unlink(backupPath).catch(() => undefined);
}

function isReplacementConflict(error: unknown): boolean {
  return (
    hasErrorCode(error, "EEXIST") ||
    hasErrorCode(error, "EPERM") ||
    hasErrorCode(error, "EACCES")
  );
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
