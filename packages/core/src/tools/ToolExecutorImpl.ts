import {
  ToolNotFoundError,
  createToolCall,
  createToolExecutionContext,
  failedToolResult,
  successfulToolResult,
} from "@agentforge/provider-sdk";
import type {
  JsonValue,
  RegisteredTool,
  ToolArguments,
  ToolCall,
  ToolRegistry,
  ToolResult,
} from "@agentforge/provider-sdk";
import type { ToolExecutionOptions, ToolExecutor } from "./ToolExecutor.js";
import {
  InvalidToolArgumentsError,
  ToolExecutionAbortedError,
  ToolExecutionPhase,
} from "./errors/index.js";
import { validateToolArguments } from "./validateToolArguments.js";

export class ToolExecutorImpl implements ToolExecutor {
  constructor(private readonly tools: ToolRegistry) {}

  async execute(
    call: ToolCall,
    options?: ToolExecutionOptions,
  ): Promise<Readonly<ToolResult>> {
    const snapshot = createToolCall(call);
    throwIfAborted(options?.signal, ToolExecutionPhase.Resolution);
    let registered: Readonly<RegisteredTool>;
    try {
      registered = this.tools.require(snapshot.name);
    } catch (error) {
      if (error instanceof ToolNotFoundError) {
        return failedToolResult(snapshot, {
          code: "tool_not_found",
          message: error.message,
        });
      }
      throw error;
    }
    throwIfAborted(options?.signal, ToolExecutionPhase.ArgumentValidation);
    let argumentsValue: Readonly<ToolArguments>;
    try {
      argumentsValue = validateToolArguments(
        registered.definition,
        snapshot.arguments,
      );
    } catch (error) {
      if (error instanceof InvalidToolArgumentsError) {
        return failedToolResult(snapshot, {
          code: "invalid_arguments",
          message: `Arguments for tool "${snapshot.name}" are invalid.`,
          details: { errors: error.details },
        });
      }
      throw error;
    }
    throwIfAborted(options?.signal, ToolExecutionPhase.Execution);
    const context = createToolExecutionContext(options);
    let output: unknown;
    try {
      output = await registered.handler(argumentsValue, context);
    } catch (error) {
      throwIfAborted(options?.signal, ToolExecutionPhase.Execution);
      return failedToolResult(snapshot, {
        code: "tool_execution_failed",
        message: `Tool "${snapshot.name}" failed.`,
      });
    }
    throwIfAborted(options?.signal, ToolExecutionPhase.Result);
    try {
      return successfulToolResult(snapshot, output as JsonValue);
    } catch {
      return failedToolResult(snapshot, {
        code: "invalid_tool_output",
        message: `Tool "${snapshot.name}" returned an invalid output.`,
      });
    }
  }
}

function throwIfAborted(
  signal: AbortSignal | undefined,
  phase: ToolExecutionPhase,
): void {
  if (signal?.aborted)
    throw new ToolExecutionAbortedError(phase, signal.reason);
}
