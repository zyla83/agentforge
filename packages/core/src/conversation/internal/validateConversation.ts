import type { Conversation } from "../Conversation.js";
import { InvalidConversationError } from "../errors/index.js";
import { collectConversationMessageValidation } from "./validateConversationMessage.js";
import { isNonEmptyString, isRecord, parseIsoTimestamp } from "./validation.js";

export function validateConversation(conversation: Conversation): void {
  const value: unknown = conversation;
  if (!isRecord(value)) {
    throw new InvalidConversationError(["conversation: must be an object"]);
  }

  const details: string[] = [];
  if (!isNonEmptyString(value.id)) {
    details.push("id: must be a non-empty string");
  }
  const createdAt = parseIsoTimestamp(value.createdAt);
  if (createdAt === undefined) {
    details.push("createdAt: must be a valid ISO 8601 timestamp");
  }
  const updatedAt = parseIsoTimestamp(value.updatedAt);
  if (updatedAt === undefined) {
    details.push("updatedAt: must be a valid ISO 8601 timestamp");
  }
  if (
    createdAt !== undefined &&
    updatedAt !== undefined &&
    updatedAt < createdAt
  ) {
    details.push("updatedAt: must not be earlier than createdAt");
  }

  if (!Array.isArray(value.messages)) {
    details.push("messages: must be an array");
  } else {
    validateMessages(value.messages, value.createdAt, value.updatedAt, details);
  }

  if (details.length > 0) throw new InvalidConversationError(details);
}

function validateMessages(
  messages: unknown[],
  createdAtValue: unknown,
  updatedAtValue: unknown,
  details: string[],
): void {
  const ids = new Set<string>();
  const createdAt = parseIsoTimestamp(createdAtValue);
  let previousTimestamp = createdAt;

  for (const [index, message] of messages.entries()) {
    const path = `messages[${index}]`;
    details.push(...collectConversationMessageValidation(message, path));
    if (!isRecord(message)) continue;

    if (isNonEmptyString(message.id)) {
      if (ids.has(message.id)) {
        details.push(`${path}.id: duplicate message ID "${message.id}"`);
      } else {
        ids.add(message.id);
      }
    }

    const timestamp = parseIsoTimestamp(message.createdAt);
    if (
      timestamp !== undefined &&
      previousTimestamp !== undefined &&
      timestamp < previousTimestamp
    ) {
      details.push(
        index === 0
          ? `${path}.createdAt: must not be earlier than conversation createdAt`
          : `${path}.createdAt: must not be earlier than the previous message`,
      );
    }
    if (timestamp !== undefined) previousTimestamp = timestamp;
  }

  if (messages.length === 0) {
    if (
      parseIsoTimestamp(createdAtValue) !== undefined &&
      parseIsoTimestamp(updatedAtValue) !== undefined &&
      createdAtValue !== updatedAtValue
    ) {
      details.push("updatedAt: must equal createdAt");
    }
    return;
  }

  const lastMessage = messages.at(-1);
  if (
    isRecord(lastMessage) &&
    parseIsoTimestamp(lastMessage.createdAt) !== undefined &&
    parseIsoTimestamp(updatedAtValue) !== undefined &&
    lastMessage.createdAt !== updatedAtValue
  ) {
    details.push("updatedAt: must equal the latest message timestamp");
  }
}
