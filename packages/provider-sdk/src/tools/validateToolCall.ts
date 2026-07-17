import type { ToolCall } from "./ToolCall.js";
import { InvalidToolCallError } from "./errors/index.js";
import { snapshotJsonObject } from "./internal/validateJsonValue.js";
import {
  inspectPlainObject,
  rejectUnknownKeys,
  validateOpaqueId,
  validateToolName,
} from "./internal/validation.js";

const CALL_KEYS = new Set(["id", "name", "arguments"]);

export function validateToolCall(call: ToolCall): void {
  snapshotToolCall(call);
}

export function snapshotToolCall(call: unknown): Readonly<ToolCall> {
  const details: string[] = [];
  const inspected = inspectPlainObject(call, "call", details);
  if (inspected === undefined) throw new InvalidToolCallError(details);
  rejectUnknownKeys(inspected, CALL_KEYS, "call", details);
  const idValid = validateOpaqueId(inspected.values.id, "id", details);
  const nameValid = validateToolName(inspected.values.name, "name", details);
  const argumentsSnapshot = snapshotJsonObject(
    inspected.values.arguments,
    "arguments",
    details,
  );

  if (
    details.length > 0 ||
    !idValid ||
    !nameValid ||
    argumentsSnapshot === undefined
  ) {
    throw new InvalidToolCallError(details);
  }
  return Object.freeze({
    id: inspected.values.id as string,
    name: inspected.values.name as string,
    arguments: argumentsSnapshot,
  });
}
