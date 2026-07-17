import type { JsonValue } from "./JsonValue.js";

export interface ToolExecutionContext {
  readonly signal?: AbortSignal;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface ToolExecutionContextOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}
