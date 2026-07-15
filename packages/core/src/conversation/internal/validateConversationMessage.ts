import type { ConversationMessage } from "../ConversationMessage.js";
import { InvalidConversationMessageError } from "../errors/index.js";
import {
  isNonEmptyString,
  isRecord,
  isSupportedRole,
  parseIsoTimestamp,
} from "./validation.js";

export function validateConversationMessage(
  message: ConversationMessage,
): void {
  const details = collectConversationMessageValidation(message);
  if (details.length > 0) throw new InvalidConversationMessageError(details);
}

export function collectConversationMessageValidation(
  value: unknown,
  path = "",
): string[] {
  const objectPath = path.length === 0 ? "message" : path;
  if (!isRecord(value)) return [`${objectPath}: must be an object`];

  const field = (name: string): string =>
    path.length === 0 ? name : `${path}.${name}`;
  const details: string[] = [];
  if (!isNonEmptyString(value.id)) {
    details.push(`${field("id")}: must be a non-empty string`);
  }
  if (!isSupportedRole(value.role)) {
    details.push(`${field("role")}: unsupported role`);
  }
  if (!isNonEmptyString(value.content)) {
    details.push(`${field("content")}: must be a non-empty string`);
  }
  if (parseIsoTimestamp(value.createdAt) === undefined) {
    details.push(`${field("createdAt")}: must be a valid ISO 8601 timestamp`);
  }
  return details;
}
