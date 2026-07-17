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
  const assistantToolCalls =
    value.role === LLMMessageRole.Assistant && value.toolCalls !== undefined;
  if (
    typeof value.content !== "string" ||
    (!assistantToolCalls && value.content.trim().length === 0)
  ) {
    details.push(
      `${field("content")}: must be ${assistantToolCalls ? "a string" : "a non-empty string"}`,
    );
  }
  if (assistantToolCalls)
    validateToolCalls(value.toolCalls, field("toolCalls"), details);
  if (value.role === LLMMessageRole.Tool)
    validateToolResultMessage(value, field, details);
  if (value.role !== LLMMessageRole.Assistant && value.toolCalls !== undefined)
    details.push(
      `${field("toolCalls")}: is only supported for assistant messages`,
    );
  if (parseIsoTimestamp(value.createdAt) === undefined) {
    details.push(`${field("createdAt")}: must be a valid ISO 8601 timestamp`);
  }
  return details;
}

function validateToolCalls(
  value: unknown,
  path: string,
  details: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    details.push(`${path}: must contain at least one tool call`);
    return;
  }
  const ids = new Set<string>();
  value.forEach((call, index) => {
    try {
      const snapshot = createToolCall(call as never);
      if (ids.has(snapshot.id))
        details.push(`${path}[${index}].id: must be unique`);
      ids.add(snapshot.id);
    } catch {
      details.push(`${path}[${index}]: must be a valid tool call`);
    }
  });
}

function validateToolResultMessage(
  value: Record<string, unknown>,
  field: (name: string) => string,
  details: string[],
): void {
  if (!isNonEmptyString(value.toolCallId))
    details.push(`${field("toolCallId")}: must be a non-empty string`);
  if (!isNonEmptyString(value.toolName))
    details.push(`${field("toolName")}: must be a non-empty string`);
  try {
    const result = createToolResult(value.result as never);
    if (
      result.toolCallId !== value.toolCallId ||
      result.toolName !== value.toolName
    )
      details.push(`${field("result")}: must match toolCallId and toolName`);
  } catch {
    details.push(`${field("result")}: must be a valid tool result`);
  }
}
import {
  LLMMessageRole,
  createToolCall,
  createToolResult,
} from "@agentforge/provider-sdk";
