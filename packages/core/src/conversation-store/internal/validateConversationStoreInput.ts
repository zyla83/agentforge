import { parseIsoTimestamp } from "../../conversation/internal/validation.js";
import { ConversationStoreOrder } from "../ConversationStoreListOptions.js";
import type { ConversationStoreListOptions } from "../ConversationStoreListOptions.js";
import { InvalidConversationStoreInputError } from "../errors/index.js";

export const DEFAULT_CONVERSATION_STORE_LIMIT = 50;
export const MAXIMUM_CONVERSATION_STORE_LIMIT = 100;

export interface ValidatedConversationStoreListOptions {
  readonly limit: number;
  readonly cursor: string | undefined;
  readonly order: ConversationStoreOrder;
}

export function validateConversationId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConversationStoreInputError([
      "conversationId must be a non-empty string",
    ]);
  }
  return value;
}

export function validateConversationStoreListOptions(
  options: ConversationStoreListOptions | undefined,
): ValidatedConversationStoreListOptions {
  if (options !== undefined && !isRecord(options)) {
    throw new InvalidConversationStoreInputError([
      "options must be an object when provided",
    ]);
  }

  const value = options as Record<string, unknown> | undefined;
  const limit = value?.limit ?? DEFAULT_CONVERSATION_STORE_LIMIT;
  const cursor = value?.cursor;
  const order = value?.order ?? ConversationStoreOrder.UpdatedDescending;
  const details: string[] = [];

  if (
    typeof limit !== "number" ||
    !Number.isFinite(limit) ||
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    details.push("limit must be a positive finite integer");
  } else if (limit > MAXIMUM_CONVERSATION_STORE_LIMIT) {
    details.push(`limit must not exceed ${MAXIMUM_CONVERSATION_STORE_LIMIT}`);
  }
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || cursor.trim().length === 0)
  ) {
    details.push("cursor must be a non-empty string when provided");
  }
  if (!Object.values(ConversationStoreOrder).includes(order as never)) {
    details.push("order must be a valid ConversationStoreOrder value");
  }

  if (details.length > 0) {
    throw new InvalidConversationStoreInputError(details);
  }

  return {
    limit: limit as number,
    cursor: cursor as string | undefined,
    order: order as ConversationStoreOrder,
  };
}

export function validateSavedAt(value: unknown, path = "savedAt"): string {
  if (parseIsoTimestamp(value) === undefined) {
    throw new InvalidConversationStoreInputError([
      `${path} must be a valid ISO 8601 timestamp`,
    ]);
  }
  return value as string;
}

export function validateRevision(value: unknown, path = "revision"): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new InvalidConversationStoreInputError([
      `${path} must be a positive integer`,
    ]);
  }
  return value as number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
