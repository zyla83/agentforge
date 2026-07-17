import type { JsonValue, ToolCall, ToolResult } from "@agentforge/provider-sdk";
import type {
  ToolExecutionCorrelation,
  ToolExecutionEventContext,
} from "./ToolExecutionObservability.js";

export interface ToolExecutionOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly correlation?: Readonly<ToolExecutionCorrelation>;
}

export interface ToolExecutor {
  execute(
    call: ToolCall,
    options?: ToolExecutionOptions,
  ): Promise<Readonly<ToolResult>>;
}

export interface ToolExecutionRecord {
  readonly call: Readonly<ToolCall>;
  readonly result: Readonly<ToolResult>;
  readonly context: Readonly<ToolExecutionEventContext>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}
