import {
  createToolCall,
  createToolResult,
  failedToolResult,
  successfulToolResult,
} from "@agentforge/provider-sdk";
import type {
  JsonObject,
  ToolCall,
  ToolResult,
} from "@agentforge/provider-sdk";
import type {
  ToolExecutionCompletedEvent,
  ToolExecutionEventContext,
  ToolExecutionRedactionContext,
  ToolExecutionRedactor,
  ToolExecutionStartedEvent,
} from "../ToolExecutionObservability.js";
import {
  createToolExecutionCompletedEvent,
  createToolExecutionStartedEvent,
} from "../toolExecutionEventFactories.js";

export class ToolExecutionEventRedactor {
  constructor(private readonly redactor: Readonly<ToolExecutionRedactor>) {}

  redactStarted(
    event: Readonly<ToolExecutionStartedEvent>,
  ): Readonly<ToolExecutionStartedEvent> {
    const call = this.redactCall(event.call, event.context, "started");
    return createToolExecutionStartedEvent({ ...event, call });
  }

  redactCompleted(
    event: Readonly<ToolExecutionCompletedEvent>,
  ): Readonly<ToolExecutionCompletedEvent> {
    const context = createRedactionContext(event.context, "completed");
    const call = this.redactCall(event.call, event.context, "completed");
    const result = this.redactResult(event.result, event.call, context);
    return createToolExecutionCompletedEvent({ ...event, call, result });
  }

  private redactCall(
    call: Readonly<ToolCall>,
    eventContext: Readonly<ToolExecutionEventContext>,
    phase: ToolExecutionRedactionContext["phase"],
  ): Readonly<ToolCall> {
    if (this.redactor.redactArguments === undefined) return call;
    const context = createRedactionContext(eventContext, phase);
    try {
      const value: unknown = this.redactor.redactArguments(
        call.arguments,
        context,
      );
      if (rejectAsyncRedaction(value)) {
        throw new TypeError("Async redaction is invalid.");
      }
      return createToolCall({
        id: call.id,
        name: call.name,
        arguments: value as JsonObject,
      });
    } catch {
      return createToolCall({ id: call.id, name: call.name, arguments: {} });
    }
  }

  private redactResult(
    result: Readonly<ToolResult>,
    call: Readonly<ToolCall>,
    context: Readonly<ToolExecutionRedactionContext>,
  ): Readonly<ToolResult> {
    if (this.redactor.redactResult === undefined) return result;
    try {
      const value: unknown = this.redactor.redactResult(result, context);
      if (rejectAsyncRedaction(value)) {
        throw new TypeError("Async redaction is invalid.");
      }
      const snapshot = createToolResult(value as ToolResult);
      if (
        snapshot.toolCallId !== result.toolCallId ||
        snapshot.toolName !== result.toolName ||
        snapshot.status !== result.status
      ) {
        throw new TypeError("Redaction changed tool result identity.");
      }
      return snapshot;
    } catch {
      return result.status === "success"
        ? successfulToolResult(call, null)
        : failedToolResult(call, {
            code: result.error.code,
            message: "Tool execution failed.",
          });
    }
  }
}

function createRedactionContext(
  context: Readonly<ToolExecutionEventContext>,
  phase: ToolExecutionRedactionContext["phase"],
): Readonly<ToolExecutionRedactionContext> {
  return Object.freeze({ phase, ...context });
}

function rejectAsyncRedaction(value: unknown): boolean {
  if (
    !(
      (typeof value === "object" && value !== null) ||
      typeof value === "function"
    )
  ) {
    return false;
  }
  let then: unknown;
  try {
    then = (value as { readonly then?: unknown }).then;
  } catch {
    return true;
  }
  if (typeof then !== "function") return false;
  try {
    void new Promise<void>((resolve, reject) => {
      Reflect.apply(then, value, [() => resolve(), reject]);
    }).catch(() => undefined);
  } catch {
    // Promise and hostile thenable behavior must remain isolated.
  }
  return true;
}
