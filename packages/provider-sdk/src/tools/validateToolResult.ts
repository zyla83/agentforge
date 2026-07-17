import type {
  ToolFailureResult,
  ToolResult,
  ToolSuccessResult,
} from "./ToolResult.js";
import { InvalidToolResultError } from "./errors/index.js";
import { snapshotJsonValue } from "./internal/validateJsonValue.js";
import {
  TOOL_ERROR_CODE_PATTERN,
  inspectPlainObject,
  rejectUnknownKeys,
  validateOpaqueId,
  validatePreservedString,
  validateToolName,
} from "./internal/validation.js";

const SUCCESS_KEYS = new Set(["toolCallId", "toolName", "status", "output"]);
const FAILURE_KEYS = new Set(["toolCallId", "toolName", "status", "error"]);
const ERROR_KEYS = new Set(["code", "message", "details"]);

export function validateToolResult(result: ToolResult): void {
  snapshotToolResult(result);
}

export function snapshotToolResult(result: unknown): Readonly<ToolResult> {
  const details: string[] = [];
  const inspected = inspectPlainObject(result, "result", details);
  if (inspected === undefined) throw new InvalidToolResultError(details);
  const status = inspected.values.status;
  if (status !== "success" && status !== "error") {
    details.push('status must equal "success" or "error"');
  }
  rejectUnknownKeys(
    inspected,
    status === "error" ? FAILURE_KEYS : SUCCESS_KEYS,
    "result",
    details,
  );
  const callIdValid = validateOpaqueId(
    inspected.values.toolCallId,
    "toolCallId",
    details,
  );
  const nameValid = validateToolName(
    inspected.values.toolName,
    "toolName",
    details,
  );

  if (status === "success") {
    const output = snapshotJsonValue(
      inspected.values.output,
      "output",
      details,
    );
    if (
      details.length > 0 ||
      !callIdValid ||
      !nameValid ||
      output === undefined
    ) {
      throw new InvalidToolResultError(details);
    }
    return Object.freeze({
      toolCallId: inspected.values.toolCallId as string,
      toolName: inspected.values.toolName as string,
      status: "success",
      output,
    } satisfies ToolSuccessResult);
  }

  const errorSnapshot = snapshotFailureError(inspected.values.error, details);
  if (
    details.length > 0 ||
    !callIdValid ||
    !nameValid ||
    errorSnapshot === undefined
  ) {
    throw new InvalidToolResultError(details);
  }
  return Object.freeze({
    toolCallId: inspected.values.toolCallId as string,
    toolName: inspected.values.toolName as string,
    status: "error",
    error: errorSnapshot,
  } satisfies ToolFailureResult);
}

function snapshotFailureError(
  value: unknown,
  details: string[],
): ToolFailureResult["error"] | undefined {
  const inspected = inspectPlainObject(value, "error", details);
  if (inspected === undefined) return undefined;
  rejectUnknownKeys(inspected, ERROR_KEYS, "error", details);
  const code = inspected.values.code;
  if (typeof code !== "string" || !TOOL_ERROR_CODE_PATTERN.test(code)) {
    details.push(`error.code must match ${TOOL_ERROR_CODE_PATTERN.source}`);
  }
  const messageValid = validatePreservedString(
    inspected.values.message,
    "error.message",
    4_000,
    details,
  );
  const hasDetails = inspected.keys.includes("details");
  const detailsSnapshot = hasDetails
    ? snapshotJsonValue(inspected.values.details, "error.details", details)
    : undefined;
  if (
    typeof code !== "string" ||
    !TOOL_ERROR_CODE_PATTERN.test(code) ||
    !messageValid ||
    (hasDetails && detailsSnapshot === undefined)
  ) {
    return undefined;
  }
  const errorSnapshot: {
    code: string;
    message: string;
    details?: typeof detailsSnapshot;
  } = { code, message: inspected.values.message as string };
  if (hasDetails) errorSnapshot.details = detailsSnapshot;
  return Object.freeze(errorSnapshot) as ToolFailureResult["error"];
}
