import type { JsonValue, ToolCall, ToolResult } from "@agentforge/provider-sdk";

export interface ToolExecutionOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
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
}
