import { resolve } from "node:path";
import { InvalidConversationStoreInputError } from "@agentforge/core";
import type { FilesystemConversationStoreOptions } from "../FilesystemConversationStoreOptions.js";
import { DEFAULT_PRETTY_FILES } from "./constants.js";

export interface ValidatedFilesystemConversationStoreOptions {
  readonly directory: string;
  readonly now: () => Date;
  readonly pretty: boolean;
}

export function validateFilesystemConversationStoreOptions(
  options: FilesystemConversationStoreOptions,
): Readonly<ValidatedFilesystemConversationStoreOptions> {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new InvalidConversationStoreInputError(["options must be an object"]);
  }

  const details: string[] = [];
  if (
    typeof value.directory !== "string" ||
    value.directory.trim().length === 0
  ) {
    details.push("directory must be a non-empty string");
  }
  if (value.now !== undefined && typeof value.now !== "function") {
    details.push("now must be a function when provided");
  }
  if (value.pretty !== undefined && typeof value.pretty !== "boolean") {
    details.push("pretty must be a boolean when provided");
  }
  if (details.length > 0) throw new InvalidConversationStoreInputError(details);

  return Object.freeze({
    directory: resolve(value.directory as string),
    now: (value.now as (() => Date) | undefined) ?? (() => new Date()),
    pretty: (value.pretty as boolean | undefined) ?? DEFAULT_PRETTY_FILES,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
