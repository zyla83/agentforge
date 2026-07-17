import {
  LLMMessageRole,
  createToolCall,
  createToolResult,
} from "@agentforge/provider-sdk";
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
  const isAssistantToolCall =
    inputValue.role === LLMMessageRole.Assistant &&
    inputValue.toolCalls !== undefined;
  if (
    typeof inputValue.content !== "string" ||
    (!isAssistantToolCall && inputValue.content.trim().length === 0)
  ) {
    details.push(
      isAssistantToolCall
        ? "content: must be a string"
        : "content: must be a non-empty string",
    );
  }
  const toolCalls = snapshotToolCalls(
    inputValue.toolCalls,
    isAssistantToolCall,
    details,
  );
  const toolResult = snapshotToolResultFields(inputValue, details);
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
  const base = {
    id,
    role: inputValue.role as ConversationMessage["role"],
    content: inputValue.content as string,
    createdAt,
  };
  const message = Object.freeze(
    toolCalls !== undefined
      ? { ...base, role: LLMMessageRole.Assistant, toolCalls }
      : toolResult !== undefined
        ? { ...base, role: LLMMessageRole.Tool, ...toolResult }
        : base,
  ) as Readonly<ConversationMessage>;
  validateConversationMessage(message);
  return message;
}

function snapshotToolCalls(
  value: unknown,
  expected: boolean,
  details: string[],
) {
  if (!expected) {
    if (value !== undefined)
      details.push("toolCalls: is only supported for assistant messages");
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    details.push("toolCalls: must contain at least one tool call");
    return undefined;
  }
  const ids = new Set<string>();
  const calls = value.map((call, index) => {
    try {
      const snapshot = createToolCall(call as never);
      if (ids.has(snapshot.id))
        details.push(`toolCalls[${index}].id: must be unique`);
      ids.add(snapshot.id);
      return snapshot;
    } catch {
      details.push(`toolCalls[${index}]: must be a valid tool call`);
      return undefined;
    }
  });
  return calls.some((call) => call === undefined)
    ? undefined
    : Object.freeze(calls as NonNullable<(typeof calls)[number]>[]);
}

function snapshotToolResultFields(
  value: Record<string, unknown>,
  details: string[],
):
  | {
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: ReturnType<typeof createToolResult>;
    }
  | undefined {
  if (value.role !== LLMMessageRole.Tool) {
    if (
      value.toolCallId !== undefined ||
      value.toolName !== undefined ||
      value.result !== undefined
    ) {
      details.push("tool result fields are only supported for tool messages");
    }
    return undefined;
  }
  let result: ReturnType<typeof createToolResult> | undefined;
  try {
    result = createToolResult(value.result as never);
  } catch {
    details.push("result: must be a valid tool result");
  }
  if (!isNonEmptyString(value.toolCallId))
    details.push("toolCallId: must be a non-empty string");
  if (!isNonEmptyString(value.toolName))
    details.push("toolName: must be a non-empty string");
  if (
    result !== undefined &&
    (result.toolCallId !== value.toolCallId ||
      result.toolName !== value.toolName)
  ) {
    details.push("result: must match toolCallId and toolName");
  }
  if (
    result === undefined ||
    typeof value.toolCallId !== "string" ||
    typeof value.toolName !== "string"
  )
    return undefined;
  return Object.freeze({
    toolCallId: value.toolCallId,
    toolName: value.toolName,
    result,
  });
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
