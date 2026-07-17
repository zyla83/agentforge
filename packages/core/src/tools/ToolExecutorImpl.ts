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
import type {
  ToolExecutionClock,
  ToolExecutionRedactor,
} from "./ToolExecutionObservability.js";
import type { ToolExecutionOptions, ToolExecutor } from "./ToolExecutor.js";
import type { ToolExecutionRecord } from "./ToolExecutor.js";
import {
  InvalidToolArgumentsError,
  ToolExecutionAbortedError,
  ToolExecutionPhase,
} from "./errors/index.js";
import { ToolExecutionEventRedactor } from "./internal/ToolExecutionEventRedactor.js";
import { ToolExecutionObserverDispatcher } from "./internal/ToolExecutionObserverDispatcher.js";
import { defaultToolExecutionClock } from "./internal/defaultToolExecutionClock.js";
import {
  createToolExecutionCompletedEvent,
  createToolExecutionEventContext,
  createToolExecutionRecord,
  createToolExecutionStartedEvent,
} from "./toolExecutionEventFactories.js";
import { validateToolArguments } from "./validateToolArguments.js";

interface ToolExecutorImplOptions {
  readonly observerDispatcher?: ToolExecutionObserverDispatcher;
  readonly clock?: ToolExecutionClock;
  readonly redactor?: Readonly<ToolExecutionRedactor>;
}

export class ToolExecutorImpl implements ToolExecutor {
  private readonly observerDispatcher: ToolExecutionObserverDispatcher;
  private readonly clock: ToolExecutionClock;
  private readonly eventRedactor: ToolExecutionEventRedactor | undefined;

  constructor(
    private readonly tools: ToolRegistry,
    options: ToolExecutorImplOptions = {},
  ) {
    this.observerDispatcher =
      options.observerDispatcher ?? new ToolExecutionObserverDispatcher([]);
    this.clock = options.clock ?? defaultToolExecutionClock;
    this.eventRedactor =
      options.redactor === undefined
        ? undefined
        : new ToolExecutionEventRedactor(options.redactor);
  }

  async execute(
    call: ToolCall,
    options?: ToolExecutionOptions,
  ): Promise<Readonly<ToolResult>> {
    const snapshot = createToolCall(call);
    return this.executeSnapshot(snapshot, options);
  }

  async executeWithRecord(
    call: ToolCall,
    options: ToolExecutionOptions & {
      readonly correlation: NonNullable<ToolExecutionOptions["correlation"]>;
    },
  ): Promise<Readonly<ToolExecutionRecord>> {
    const snapshot = createToolCall(call);
    const context = createToolExecutionEventContext(
      options.correlation,
      snapshot,
    );
    const startedAt = readWallClock(this.clock);
    if (this.observerDispatcher.enabled) {
      const event = createToolExecutionStartedEvent({
        context,
        call: snapshot,
        startedAt,
      });
      this.observerDispatcher.emit(
        this.eventRedactor?.redactStarted(event) ?? event,
      );
    }
    const monotonicStart = readMonotonicClock(this.clock);
    const result = await this.executeSnapshot(snapshot, options);
    const monotonicCompletion = readMonotonicClock(this.clock);
    const completedAt = readWallClock(this.clock);
    const durationMs = Math.max(0, monotonicCompletion - monotonicStart);
    const record = createToolExecutionRecord({
      context,
      call: snapshot,
      result,
      startedAt,
      completedAt,
      durationMs,
    });
    if (this.observerDispatcher.enabled) {
      const event = createToolExecutionCompletedEvent(record);
      this.observerDispatcher.emit(
        this.eventRedactor?.redactCompleted(event) ?? event,
      );
    }
    return record;
  }

  private async executeSnapshot(
    snapshot: Readonly<ToolCall>,
    options?: ToolExecutionOptions,
  ): Promise<Readonly<ToolResult>> {
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
    const context = createToolExecutionContext({
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      ...(options?.metadata === undefined
        ? {}
        : { metadata: options.metadata }),
    });
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

function readWallClock(clock: ToolExecutionClock): string {
  const value = clock.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Tool execution clock returned an invalid date.");
  }
  return value.toISOString();
}

function readMonotonicClock(clock: ToolExecutionClock): number {
  const value = clock.monotonicNow();
  if (!Number.isFinite(value)) {
    throw new TypeError("Tool execution clock returned a non-finite value.");
  }
  return value;
}

function throwIfAborted(
  signal: AbortSignal | undefined,
  phase: ToolExecutionPhase,
): void {
  if (signal?.aborted)
    throw new ToolExecutionAbortedError(phase, signal.reason);
}
