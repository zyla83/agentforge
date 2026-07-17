import type { JsonValue } from "./JsonValue.js";
import type { ToolCall } from "./ToolCall.js";
import type {
  ToolFailureResult,
  ToolResult,
  ToolSuccessResult,
} from "./ToolResult.js";
import { InvalidToolResultError } from "./errors/index.js";
import {
  inspectPlainObject,
  rejectUnknownKeys,
} from "./internal/validation.js";
import { snapshotToolResult } from "./validateToolResult.js";

const CALL_REFERENCE_KEYS = new Set(["id", "name", "arguments"]);

export function createToolResult(result: ToolResult): Readonly<ToolResult> {
  return snapshotToolResult(result);
}

export function successfulToolResult(
  toolCall: Pick<ToolCall, "id" | "name">,
  output: JsonValue,
): Readonly<ToolSuccessResult> {
  const reference = snapshotCallReference(toolCall);
  return snapshotToolResult({
    toolCallId: reference.id,
    toolName: reference.name,
    status: "success",
    output,
  }) as Readonly<ToolSuccessResult>;
}

export function failedToolResult(
  toolCall: Pick<ToolCall, "id" | "name">,
  error: ToolFailureResult["error"],
): Readonly<ToolFailureResult> {
  const reference = snapshotCallReference(toolCall);
  return snapshotToolResult({
    toolCallId: reference.id,
    toolName: reference.name,
    status: "error",
    error,
  }) as Readonly<ToolFailureResult>;
}

function snapshotCallReference(value: unknown): {
  readonly id: string;
  readonly name: string;
} {
  const details: string[] = [];
  const inspected = inspectPlainObject(value, "toolCall", details);
  if (inspected === undefined) throw new InvalidToolResultError(details);
  rejectUnknownKeys(inspected, CALL_REFERENCE_KEYS, "toolCall", details);
  if (details.length > 0) throw new InvalidToolResultError(details);
  return {
    id: inspected.values.id as string,
    name: inspected.values.name as string,
  };
}
