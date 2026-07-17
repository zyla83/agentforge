import type { JsonValue, ToolCall, ToolResult } from "@agentforge/provider-sdk";

export const DEFAULT_TOOL_PREVIEW_LENGTH = 300;
const MAX_TOOL_IDENTIFIER_LENGTH = 100;
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences must be recognized explicitly
const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -\/]*[@-~]/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences must be recognized explicitly
const ANSI_OSC_PATTERN = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/gu;
export function sanitizeTerminalText(value: string): string {
  const withoutAnsi = value
    .replace(ANSI_OSC_PATTERN, "")
    .replace(ANSI_CSI_PATTERN, "");
  let sanitized = "";
  let replacingControls = false;
  for (const character of withoutAnsi) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      if (!sanitized.endsWith(" ")) sanitized += " ";
      replacingControls = true;
      continue;
    }
    if (replacingControls && character === " ") continue;
    sanitized += character;
    replacingControls = false;
  }
  return sanitized;
}

export function truncateTerminalPreview(
  value: string,
  maxLength = DEFAULT_TOOL_PREVIEW_LENGTH,
): string {
  const limit =
    Number.isFinite(maxLength) && maxLength >= 0
      ? Math.floor(maxLength)
      : DEFAULT_TOOL_PREVIEW_LENGTH;
  const codePoints = Array.from(value);
  if (codePoints.length <= limit) return value;
  if (limit === 0) return "";
  if (limit === 1) return "…";
  return `${codePoints.slice(0, limit - 1).join("")}…`;
}

export function formatJsonPreview(
  value: JsonValue,
  maxLength = DEFAULT_TOOL_PREVIEW_LENGTH,
): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? ""
      : truncateTerminalPreview(sanitizeTerminalText(serialized), maxLength);
  } catch {
    return "";
  }
}

export function formatToolCallStarted(call: Readonly<ToolCall>): string {
  const argumentsPreview = formatJsonPreview(call.arguments);
  const toolName = formatIdentifier(call.name);
  return `Tool: ${toolName}${argumentsPreview.length > 0 ? ` ${argumentsPreview}` : ""}`;
}

export function formatToolCallCompleted(result: Readonly<ToolResult>): string {
  const toolName = formatIdentifier(result.toolName);
  if (result.status === "success") {
    const outputPreview = formatJsonPreview(result.output);
    return `Tool result: ${toolName} succeeded${outputPreview.length > 0 ? ` ${outputPreview}` : ""}`;
  }
  const errorCode = formatIdentifier(result.error.code);
  const message = truncateTerminalPreview(
    sanitizeTerminalText(result.error.message),
  );
  return `Tool result: ${toolName} failed (${errorCode}): ${message}`;
}

function formatIdentifier(value: string): string {
  const sanitized = truncateTerminalPreview(
    sanitizeTerminalText(value),
    MAX_TOOL_IDENTIFIER_LENGTH,
  ).trim();
  return sanitized.length === 0 ? "unknown" : sanitized;
}
