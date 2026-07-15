import type { LLMMessageRole } from "@agentforge/provider-sdk";
import type { ConversationFactoryOptions } from "./ConversationIdGenerator.js";
import type { ConversationMessageInput } from "./ConversationInput.js";
import type { ConversationMessage } from "./ConversationMessage.js";
import { InvalidConversationMessageError } from "./errors/index.js";
import { validateConversationMessage } from "./internal/validateConversationMessage.js";
import {
  isNonEmptyString,
  isRecord,
  isSupportedRole,
  parseIsoTimestamp,
} from "./internal/validation.js";

export function createConversationMessage(
  input: ConversationMessageInput,
  options?: ConversationFactoryOptions,
): Readonly<ConversationMessage> {
  const inputValue: unknown = input;
  if (!isRecord(inputValue)) {
    throw new InvalidConversationMessageError(["message: must be an object"]);
  }
  const optionsValue = validateOptions(options);
  const details: string[] = [];

  if (inputValue.id !== undefined && !isNonEmptyString(inputValue.id)) {
    details.push("id: must be a non-empty string");
  }
  if (!isSupportedRole(inputValue.role)) {
    details.push("role: unsupported role");
  }
  if (!isNonEmptyString(inputValue.content)) {
    details.push("content: must be a non-empty string");
  }
  if (
    inputValue.createdAt !== undefined &&
    parseIsoTimestamp(inputValue.createdAt) === undefined
  ) {
    details.push("createdAt: must be a valid ISO 8601 timestamp");
  }
  if (details.length > 0) throw new InvalidConversationMessageError(details);

  const id =
    inputValue.id === undefined
      ? generateId(optionsValue)
      : (inputValue.id as string);
  const createdAt =
    inputValue.createdAt === undefined
      ? generateTimestamp(optionsValue)
      : (inputValue.createdAt as string);
  const message: ConversationMessage = {
    id,
    role: inputValue.role as LLMMessageRole,
    content: inputValue.content as string,
    createdAt,
  };
  validateConversationMessage(message);
  return Object.freeze(message);
}

function validateOptions(
  options: ConversationFactoryOptions | undefined,
): Record<string, unknown> {
  if (options === undefined) return {};
  if (!isRecord(options)) {
    throw new InvalidConversationMessageError([
      "options: must be an object when provided",
    ]);
  }
  if (
    options.idGenerator !== undefined &&
    typeof options.idGenerator !== "function"
  ) {
    throw new InvalidConversationMessageError([
      "idGenerator: must be a function",
    ]);
  }
  if (options.now !== undefined && typeof options.now !== "function") {
    throw new InvalidConversationMessageError(["now: must be a function"]);
  }
  return options;
}

function generateId(options: Record<string, unknown>): string {
  const generator =
    typeof options.idGenerator === "function"
      ? (options.idGenerator as () => unknown)
      : () => globalThis.crypto.randomUUID();
  let value: unknown;
  try {
    value = generator();
  } catch (error) {
    throw new InvalidConversationMessageError(
      ["idGenerator: failed to generate an ID"],
      { cause: error },
    );
  }
  if (!isNonEmptyString(value)) {
    throw new InvalidConversationMessageError([
      "idGenerator: must return a non-empty string",
    ]);
  }
  return value;
}

function generateTimestamp(options: Record<string, unknown>): string {
  const now =
    typeof options.now === "function"
      ? (options.now as () => unknown)
      : () => new Date();
  let value: unknown;
  try {
    value = now();
  } catch (error) {
    throw new InvalidConversationMessageError(
      ["now: failed to return the current date"],
      { cause: error },
    );
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidConversationMessageError([
      "now: must return a valid Date",
    ]);
  }
  return value.toISOString();
}
