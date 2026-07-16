import {
  isNonEmptyString,
  isSupportedRole,
  parseIsoTimestamp,
} from "../../conversation/internal/validation.js";
import type { ConversationDocumentV1 } from "../ConversationDocument.js";
import {
  InvalidConversationDocumentError,
  UnsupportedConversationDocumentVersionError,
} from "../errors/index.js";
import {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_DOCUMENT_VERSION,
} from "./constants.js";

const ENVELOPE_KEYS = new Set(["kind", "version", "conversation"]);
const CONVERSATION_KEYS = new Set(["id", "createdAt", "updatedAt", "messages"]);
const MESSAGE_KEYS = new Set(["id", "role", "content", "createdAt"]);

export function validateConversationDocument(
  value: unknown,
): ConversationDocumentV1 {
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
      version !== CONVERSATION_DOCUMENT_VERSION
    ) {
      throw new UnsupportedConversationDocumentVersionError(
        CONVERSATION_DOCUMENT_KIND,
        version,
        [CONVERSATION_DOCUMENT_VERSION],
      );
    }

    if (!hasOwn(value, "conversation")) {
      details.push("conversation is required");
    } else {
      validateConversationValue(value.conversation, "conversation", details);
    }

    if (details.length > 0) throw new InvalidConversationDocumentError(details);
    return value as unknown as ConversationDocumentV1;
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
): value is ConversationDocumentV1["conversation"] {
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
      validateMessage(message, `${path}.messages[${index}]`, details);
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
): void {
  if (!isPlainObject(value)) {
    details.push(`${path} must be a plain object`);
    return;
  }
  collectUnknownProperties(value, MESSAGE_KEYS, path, details);
  validateNonEmptyString(value, "id", path, details);
  if (!hasOwn(value, "role")) {
    details.push(`${path}.role is required`);
  } else if (!isSupportedRole(value.role)) {
    details.push(`${path}.role must be a valid LLMMessageRole`);
  }
  validateNonEmptyString(value, "content", path, details);
  validateTimestamp(value, "createdAt", path, details);
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
