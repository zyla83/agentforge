import type {
  ToolExecutionContext,
  ToolExecutionContextOptions,
} from "./ToolExecutionContext.js";
import { ToolContractError } from "./errors/index.js";
import { snapshotJsonObject } from "./internal/validateJsonValue.js";
import {
  inspectPlainObject,
  rejectUnknownKeys,
} from "./internal/validation.js";

const CONTEXT_KEYS = new Set(["signal", "metadata"]);

export function createToolExecutionContext(
  options?: ToolExecutionContextOptions,
): Readonly<ToolExecutionContext> {
  const details: string[] = [];
  let signal: AbortSignal | undefined;
  let metadata: ToolExecutionContext["metadata"] = Object.freeze({});
  if (options !== undefined) {
    const inspected = inspectPlainObject(options, "options", details);
    if (inspected !== undefined) {
      rejectUnknownKeys(inspected, CONTEXT_KEYS, "options", details);
      if (inspected.values.signal !== undefined) {
        if (!isAbortSignal(inspected.values.signal)) {
          details.push("signal must be an AbortSignal");
        } else {
          signal = inspected.values.signal;
        }
      }
      if (inspected.values.metadata !== undefined) {
        const snapshot = snapshotJsonObject(
          inspected.values.metadata,
          "metadata",
          details,
        );
        if (snapshot !== undefined) metadata = snapshot;
      }
    }
  }
  if (details.length > 0) {
    throw new ToolContractError(
      `Tool execution context is invalid: ${details.join("; ")}.`,
    );
  }
  return signal === undefined
    ? Object.freeze({ metadata })
    : Object.freeze({ signal, metadata });
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    "aborted" in value &&
    typeof value.aborted === "boolean" &&
    "addEventListener" in value &&
    typeof value.addEventListener === "function" &&
    "removeEventListener" in value &&
    typeof value.removeEventListener === "function"
  );
}
