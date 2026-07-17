import { resolve } from "node:path";
import process from "node:process";
import { ChatFileOperationError } from "./ChatFileOperationError.js";

export function resolveUserFilePath(filePath: string): string {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new ChatFileOperationError(
      "File path must be a non-empty string.",
      typeof filePath === "string" ? filePath : "<unknown>",
    );
  }
  return resolve(process.cwd(), filePath);
}
