import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SpotifyCredentialStoreCorruptionError,
  SpotifyCredentialStoreInitializationError,
  SpotifyCredentialStoreIoError,
  SpotifyRequestError,
} from "./errors.js";
import {
  deepFreeze,
  isNonEmptyString,
  isRecord,
  rejectUnknown,
} from "./internal.js";
import type {
  SpotifyRefreshCredential,
  SpotifyRefreshCredentialStore,
} from "./types.js";

const CREDENTIAL_FILENAME = "spotify-refresh-credential.json";
const ALLOWED_PROPERTIES = new Set(["version", "refreshToken", "scopes"]);

export interface SpotifyCredentialFileOperations {
  readonly mkdir: typeof mkdir;
  readonly open: typeof open;
  readonly readFile: typeof readFile;
  readonly rename: typeof rename;
  readonly unlink: typeof unlink;
}

export interface FilesystemSpotifyCredentialStoreOptions {
  readonly directory: string;
  readonly fileOperations?: SpotifyCredentialFileOperations;
  readonly createTemporaryId?: () => string;
}

export class FilesystemSpotifyCredentialStore
  implements SpotifyRefreshCredentialStore
{
  readonly directory: string;
  readonly filePath: string;
  private readonly operations: SpotifyCredentialFileOperations;
  private readonly createTemporaryId: () => string;

  constructor(options: FilesystemSpotifyCredentialStoreOptions) {
    if (!isRecord(options) || !isNonEmptyString(options.directory)) {
      throw new SpotifyRequestError([
        "options.directory: must be a non-empty string",
      ]);
    }
    if (
      options.fileOperations !== undefined &&
      !hasFileOperations(options.fileOperations)
    ) {
      throw new SpotifyRequestError([
        "options.fileOperations: must provide filesystem operations",
      ]);
    }
    if (
      options.createTemporaryId !== undefined &&
      typeof options.createTemporaryId !== "function"
    ) {
      throw new SpotifyRequestError([
        "options.createTemporaryId: must be a function",
      ]);
    }
    this.directory = resolve(options.directory);
    this.filePath = resolve(this.directory, CREDENTIAL_FILENAME);
    this.operations = options.fileOperations ?? {
      mkdir,
      open,
      readFile,
      rename,
      unlink,
    };
    this.createTemporaryId = options.createTemporaryId ?? randomUUID;
  }

  async load(): Promise<Readonly<SpotifyRefreshCredential> | undefined> {
    let contents: string;
    try {
      contents = await this.operations.readFile(this.filePath, "utf8");
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw new SpotifyCredentialStoreIoError("load", { cause: error });
    }
    let value: unknown;
    try {
      value = JSON.parse(contents);
    } catch (error) {
      throw new SpotifyCredentialStoreCorruptionError(
        ["document: must be valid JSON"],
        { cause: error },
      );
    }
    return decodeCredential(value);
  }

  async save(credential: SpotifyRefreshCredential): Promise<void> {
    const snapshot = validateCredential(credential, SpotifyRequestError);
    try {
      await this.operations.mkdir(this.directory, { recursive: true });
    } catch (error) {
      throw new SpotifyCredentialStoreInitializationError({ cause: error });
    }
    const temporaryPath = resolve(
      this.directory,
      `.${CREDENTIAL_FILENAME}.${this.createTemporaryId()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await this.operations.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(
        `${JSON.stringify(snapshot, undefined, 2)}\n`,
        "utf8",
      );
      await handle.sync();
      await handle.close();
      handle = undefined;
      await replaceCredentialFile(
        this.operations,
        temporaryPath,
        this.filePath,
        this.createTemporaryId(),
      );
    } catch (error) {
      await handle?.close().catch(() => undefined);
      throw new SpotifyCredentialStoreIoError("save", { cause: error });
    } finally {
      await this.operations.unlink(temporaryPath).catch(() => undefined);
    }
  }
}

function decodeCredential(value: unknown): Readonly<SpotifyRefreshCredential> {
  return validateCredential(value, SpotifyCredentialStoreCorruptionError);
}

type DetailErrorConstructor = new (details: readonly string[]) => Error;

function validateCredential(
  value: unknown,
  ErrorType: DetailErrorConstructor,
): Readonly<SpotifyRefreshCredential> {
  const details: string[] = [];
  if (!isRecord(value)) throw new ErrorType(["document: must be an object"]);
  rejectUnknown(value, ALLOWED_PROPERTIES, "document", details);
  if (value.version !== 1)
    details.push("document.version: unsupported version");
  if (!isNonEmptyString(value.refreshToken))
    details.push("document.refreshToken: must be a non-empty string");
  const scopes: string[] = [];
  if (!Array.isArray(value.scopes) || value.scopes.length === 0) {
    details.push("document.scopes: must be a non-empty array");
  } else {
    value.scopes.forEach((scope, index) => {
      if (!isNonEmptyString(scope))
        details.push(`document.scopes[${index}]: must be a non-empty string`);
      else scopes.push(scope);
    });
  }
  if (scopes.length !== 1 || scopes[0] !== "user-read-playback-state") {
    details.push(
      "document.scopes: must contain exactly user-read-playback-state",
    );
  }
  if (details.length > 0) throw new ErrorType(details);
  return deepFreeze({
    version: 1,
    refreshToken: value.refreshToken as string,
    scopes,
  });
}

function hasFileOperations(
  value: unknown,
): value is SpotifyCredentialFileOperations {
  return (
    isRecord(value) &&
    ["mkdir", "open", "readFile", "rename", "unlink"].every(
      (key) => typeof value[key] === "function",
    )
  );
}

function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

async function replaceCredentialFile(
  operations: SpotifyCredentialFileOperations,
  temporaryPath: string,
  finalPath: string,
  identifier: string,
): Promise<void> {
  try {
    await operations.rename(temporaryPath, finalPath);
    return;
  } catch (error) {
    if (
      !hasCode(error, "EEXIST") &&
      !hasCode(error, "EPERM") &&
      !hasCode(error, "EACCES")
    ) {
      throw error;
    }
  }
  const backupPath = `${finalPath}.${identifier}.bak`;
  await operations.rename(finalPath, backupPath);
  try {
    await operations.rename(temporaryPath, finalPath);
  } catch (error) {
    await operations.rename(backupPath, finalPath).catch(() => undefined);
    throw error;
  }
  await operations.unlink(backupPath).catch(() => undefined);
}
