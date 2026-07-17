import type { JsonValue, ToolCall, ToolResult } from "@agentforge/provider-sdk";

export const DEFAULT_TOOL_PREVIEW_LENGTH = 300;

export function formatJsonPreview(
  value: JsonValue,
  maxLength = DEFAULT_TOOL_PREVIEW_LENGTH,
): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? ""
      : truncatePreview(serialized, maxLength);
  } catch {
    return "";
  }
}

export function formatToolCallStarted(call: Readonly<ToolCall>): string {
  const argumentsPreview = formatJsonPreview(call.arguments);
  return `Tool: ${call.name}${argumentsPreview.length > 0 ? ` ${argumentsPreview}` : ""}`;
}

export function formatToolCallCompleted(result: Readonly<ToolResult>): string {
  if (result.status === "success") {
    const outputPreview = formatJsonPreview(result.output);
    return `Tool result: ${result.toolName} succeeded${outputPreview.length > 0 ? ` ${outputPreview}` : ""}`;
  }
  return `Tool result: ${result.toolName} failed (${result.error.code}): ${truncatePreview(result.error.message, DEFAULT_TOOL_PREVIEW_LENGTH)}`;
}

function truncatePreview(value: string, maxLength: number): string {
  const limit = Number.isFinite(maxLength)
    ? Math.max(0, Math.floor(maxLength))
    : DEFAULT_TOOL_PREVIEW_LENGTH;
  if (value.length <= limit) return value;
  if (limit === 0) return "";
  if (limit <= 3) return ".".repeat(limit);
  return `${value.slice(0, limit - 3)}...`;
}
