import {
  LLMMessageRole,
  createToolCall,
  createToolResult,
} from "@agentforge/provider-sdk";
import {
  isNonEmptyString,
  isSupportedRole,
  parseIsoTimestamp,
} from "../../conversation/internal/validation.js";
import type {
  ConversationDocument,
  SerializedConversationV1,
  SerializedConversationV2,
} from "../ConversationDocument.js";
import {
  InvalidConversationDocumentError,
  UnsupportedConversationDocumentVersionError,
} from "../errors/index.js";
import {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_DOCUMENT_VERSION_1,
  CONVERSATION_DOCUMENT_VERSION_2,
} from "./constants.js";

const ENVELOPE_KEYS = new Set(["kind", "version", "conversation"]);
const CONVERSATION_KEYS = new Set(["id", "createdAt", "updatedAt", "messages"]);
const TEXT_MESSAGE_KEYS = new Set(["id", "role", "content", "createdAt"]);
const TOOL_CALL_MESSAGE_KEYS = new Set([...TEXT_MESSAGE_KEYS, "toolCalls"]);
const TOOL_RESULT_MESSAGE_KEYS = new Set([
  ...TEXT_MESSAGE_KEYS,
  "toolCallId",
  "toolName",
  "result",
]);

export function validateConversationDocument(
  value: unknown,
): ConversationDocument {
  try {
    if (!isPlainObject(value)) {
      throw new InvalidConversationDocumentError([
        "document must be a plain object",
      ]);
    }

    const details: string[] = [];
    collectUnknownProperties(value, ENVELOPE_KEYS, "", details);
    validateKind(value, details);
    const version = validateVersion(value, details);
    if (
      details.length === 0 &&
      version !== undefined &&
      version !== CONVERSATION_DOCUMENT_VERSION_1 &&
      version !== CONVERSATION_DOCUMENT_VERSION_2
    ) {
      throw new UnsupportedConversationDocumentVersionError(
        CONVERSATION_DOCUMENT_KIND,
        version,
        [CONVERSATION_DOCUMENT_VERSION_1, CONVERSATION_DOCUMENT_VERSION_2],
      );
    }

    if (!hasOwn(value, "conversation")) {
      details.push("conversation is required");
    } else {
      validateConversationValue(
        value.conversation,
        "conversation",
        details,
        version ?? CONVERSATION_DOCUMENT_VERSION_2,
      );
    }

    if (details.length > 0) throw new InvalidConversationDocumentError(details);
    return value as unknown as ConversationDocument;
  } catch (error) {
    if (
      error instanceof InvalidConversationDocumentError ||
      error instanceof UnsupportedConversationDocumentVersionError
    ) {
      throw error;
    }
    throw new InvalidConversationDocumentError(
      ["document could not be inspected safely"],
      { cause: error },
    );
  }
}

export function validateConversationValue(
  value: unknown,
  path: string,
  details: string[],
  version: number = CONVERSATION_DOCUMENT_VERSION_2,
): value is SerializedConversationV1 | SerializedConversationV2 {
  if (!isPlainObject(value)) {
    details.push(`${path} must be a plain object`);
    return false;
  }

  collectUnknownProperties(value, CONVERSATION_KEYS, path, details);
  validateNonEmptyString(value, "id", path, details);
  validateTimestamp(value, "createdAt", path, details);
  validateTimestamp(value, "updatedAt", path, details);

  if (!hasOwn(value, "messages")) {
    details.push(`${path}.messages is required`);
  } else if (!Array.isArray(value.messages)) {
    details.push(`${path}.messages must be an array`);
  } else {
    for (const [index, message] of value.messages.entries()) {
      validateMessage(message, `${path}.messages[${index}]`, details, version);
    }
  }
  return true;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function collectUnknownProperties(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  details: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      details.push(
        `${path.length > 0 ? `${path}.` : ""}${key} is not supported`,
      );
    }
  }
}

export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateMessage(
  value: unknown,
  path: string,
  details: string[],
  version: number,
): void {
  if (!isPlainObject(value)) {
    details.push(`${path} must be a plain object`);
    return;
  }
  const hasToolCalls = Object.hasOwn(value, "toolCalls");
  const isToolResult = value.role === LLMMessageRole.Tool;
  collectUnknownProperties(
    value,
    hasToolCalls
      ? TOOL_CALL_MESSAGE_KEYS
      : isToolResult
        ? TOOL_RESULT_MESSAGE_KEYS
        : TEXT_MESSAGE_KEYS,
    path,
    details,
  );
  validateNonEmptyString(value, "id", path, details);
  if (!hasOwn(value, "role")) {
    details.push(`${path}.role is required`);
  } else if (
    !isSupportedRole(value.role) ||
    (version === CONVERSATION_DOCUMENT_VERSION_1 &&
      value.role === LLMMessageRole.Tool)
  ) {
    details.push(`${path}.role must be a valid LLMMessageRole`);
  }
  if (hasToolCalls) {
    if (version === CONVERSATION_DOCUMENT_VERSION_1)
      details.push(`${path}.toolCalls is not supported in version 1`);
    if (value.role !== LLMMessageRole.Assistant)
      details.push(`${path}.role must be assistant when toolCalls are present`);
    validateString(value, "content", path, details);
    validateToolCalls(value.toolCalls, `${path}.toolCalls`, details);
  } else {
    validateNonEmptyString(value, "content", path, details);
  }
  if (isToolResult) {
    if (version === CONVERSATION_DOCUMENT_VERSION_1)
      details.push(`${path} tool results are not supported in version 1`);
    validateNonEmptyString(value, "toolCallId", path, details);
    validateNonEmptyString(value, "toolName", path, details);
    try {
      const result = createToolResult(value.result as never);
      if (
        result.toolCallId !== value.toolCallId ||
        result.toolName !== value.toolName
      )
        details.push(`${path}.result must match toolCallId and toolName`);
    } catch {
      details.push(`${path}.result must be a valid tool result`);
    }
  }
  validateTimestamp(value, "createdAt", path, details);
}

function validateToolCalls(
  value: unknown,
  path: string,
  details: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    details.push(`${path} must contain at least one tool call`);
    return;
  }
  const ids = new Set<string>();
  value.forEach((call, index) => {
    try {
      const snapshot = createToolCall(call as never);
      if (ids.has(snapshot.id))
        details.push(`${path}[${index}].id must be unique`);
      ids.add(snapshot.id);
    } catch {
      details.push(`${path}[${index}] must be a valid tool call`);
    }
  });
}

function validateKind(value: Record<string, unknown>, details: string[]): void {
  if (!hasOwn(value, "kind")) {
    details.push("kind is required");
  } else if (value.kind !== CONVERSATION_DOCUMENT_KIND) {
    details.push(`kind must equal "${CONVERSATION_DOCUMENT_KIND}"`);
  }
}

function validateVersion(
  value: Record<string, unknown>,
  details: string[],
): number | undefined {
  if (!hasOwn(value, "version")) {
    details.push("version is required");
    return undefined;
  }
  if (
    typeof value.version !== "number" ||
    !Number.isFinite(value.version) ||
    !Number.isInteger(value.version) ||
    value.version <= 0
  ) {
    details.push("version must be a positive integer");
    return undefined;
  }
  return value.version;
}

function validateNonEmptyString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  details: string[],
): void {
  if (!hasOwn(value, key)) {
    details.push(`${path}.${key} is required`);
  } else if (!isNonEmptyString(value[key])) {
    details.push(`${path}.${key} must be a non-empty string`);
  }
}

function validateString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  details: string[],
): void {
  if (!hasOwn(value, key)) details.push(`${path}.${key} is required`);
  else if (typeof value[key] !== "string")
    details.push(`${path}.${key} must be a string`);
}

function validateTimestamp(
  value: Record<string, unknown>,
  key: string,
  path: string,
  details: string[],
): void {
  if (!hasOwn(value, key)) {
    details.push(`${path}.${key} is required`);
  } else if (parseIsoTimestamp(value[key]) === undefined) {
    details.push(`${path}.${key} must be a valid ISO 8601 timestamp`);
  }
}
