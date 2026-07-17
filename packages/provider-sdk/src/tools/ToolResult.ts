import type { JsonValue } from "./JsonValue.js";

export interface ToolSuccessResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "success";
  readonly output: JsonValue;
}

export interface ToolFailureResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "error";
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: JsonValue;
  };
}

export type ToolResult = ToolSuccessResult | ToolFailureResult;
