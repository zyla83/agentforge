import type { Conversation } from "./Conversation.js";
import type { ConversationFactoryOptions } from "./ConversationIdGenerator.js";
import type { CreateConversationInput } from "./ConversationInput.js";
import type { ConversationMessage } from "./ConversationMessage.js";
import { createConversationMessage } from "./createConversationMessage.js";
import {
  InvalidConversationError,
  InvalidConversationMessageError,
} from "./errors/index.js";
import { validateConversation } from "./internal/validateConversation.js";
import {
  isNonEmptyString,
  isRecord,
  parseIsoTimestamp,
} from "./internal/validation.js";

export function createConversation(
  input: CreateConversationInput = {},
  options?: ConversationFactoryOptions,
): Readonly<Conversation> {
  const inputValue: unknown = input;
  if (!isRecord(inputValue)) {
    throw new InvalidConversationError(["input: must be an object"]);
  }
  validateOptions(options);
  const details: string[] = [];
  if (inputValue.id !== undefined && !isNonEmptyString(inputValue.id)) {
    details.push("id: must be a non-empty string");
  }
  if (
    inputValue.createdAt !== undefined &&
    parseIsoTimestamp(inputValue.createdAt) === undefined
  ) {
    details.push("createdAt: must be a valid ISO 8601 timestamp");
  }
  if (
    inputValue.messages !== undefined &&
    !Array.isArray(inputValue.messages)
  ) {
    details.push("messages: must be an array");
  }
  if (details.length > 0) throw new InvalidConversationError(details);

  const id =
    inputValue.id === undefined
      ? generateConversationId(options)
      : (inputValue.id as string);
  const createdAt =
    inputValue.createdAt === undefined
      ? generateConversationTimestamp(options)
      : (inputValue.createdAt as string);
  const messages = createInitialMessages(inputValue.messages, options);
  const updatedAt = messages.at(-1)?.createdAt ?? createdAt;
  const conversation: Conversation = Object.freeze({
    id,
    createdAt,
    updatedAt,
    messages: Object.freeze(messages),
  });
  validateConversation(conversation);
  return conversation;
}

function createInitialMessages(
  value: unknown,
  options: ConversationFactoryOptions | undefined,
): Readonly<ConversationMessage>[] {
  if (value === undefined) return [];
  const messages: Readonly<ConversationMessage>[] = [];
  const details: string[] = [];
  for (const [index, input] of (value as unknown[]).entries()) {
    try {
      messages.push(createConversationMessage(input as never, options));
    } catch (error) {
      if (!(error instanceof InvalidConversationMessageError)) throw error;
      details.push(
        ...error.details.map((detail) => prefixMessageDetail(index, detail)),
      );
    }
  }
  if (details.length > 0) throw new InvalidConversationError(details);
  return messages;
}

function prefixMessageDetail(index: number, detail: string): string {
  if (detail.startsWith("message:")) {
    return `messages[${index}]:${detail.slice("message:".length)}`;
  }
  return `messages[${index}].${detail}`;
}

function validateOptions(
  options: ConversationFactoryOptions | undefined,
): void {
  if (options === undefined) return;
  if (!isRecord(options)) {
    throw new InvalidConversationError([
      "options: must be an object when provided",
    ]);
  }
  const details: string[] = [];
  if (
    options.idGenerator !== undefined &&
    typeof options.idGenerator !== "function"
  ) {
    details.push("idGenerator: must be a function");
  }
  if (options.now !== undefined && typeof options.now !== "function") {
    details.push("now: must be a function");
  }
  if (details.length > 0) throw new InvalidConversationError(details);
}

function generateConversationId(
  options: ConversationFactoryOptions | undefined,
): string {
  let value: unknown;
  try {
    value = (options?.idGenerator ?? (() => globalThis.crypto.randomUUID()))();
  } catch (error) {
    throw new InvalidConversationError(
      ["idGenerator: failed to generate an ID"],
      { cause: error },
    );
  }
  if (!isNonEmptyString(value)) {
    throw new InvalidConversationError([
      "idGenerator: must return a non-empty string",
    ]);
  }
  return value;
}

function generateConversationTimestamp(
  options: ConversationFactoryOptions | undefined,
): string {
  let value: unknown;
  try {
    value = (options?.now ?? (() => new Date()))();
  } catch (error) {
    throw new InvalidConversationError(
      ["now: failed to return the current date"],
      { cause: error },
    );
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidConversationError(["now: must return a valid Date"]);
  }
  return value.toISOString();
}
