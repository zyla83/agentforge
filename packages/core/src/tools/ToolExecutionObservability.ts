import type {
  JsonObject,
  ToolCall,
  ToolResult,
} from "@agentforge/provider-sdk";

export interface ToolExecutionEventContext {
  readonly conversationId: string;
  readonly turnId: string;
  readonly providerRound: number;
  readonly executionIndex: number;
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface ToolExecutionStartedEvent {
  readonly type: "tool-execution-started";
  readonly context: Readonly<ToolExecutionEventContext>;
  readonly call: Readonly<ToolCall>;
  readonly startedAt: string;
}

export interface ToolExecutionCompletedEvent {
  readonly type: "tool-execution-completed";
  readonly context: Readonly<ToolExecutionEventContext>;
  readonly call: Readonly<ToolCall>;
  readonly result: Readonly<ToolResult>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export type ToolExecutionObserverEvent =
  | ToolExecutionStartedEvent
  | ToolExecutionCompletedEvent;

export type ToolExecutionObserver = (
  event: Readonly<ToolExecutionObserverEvent>,
) => void;

export interface ToolExecutionClock {
  now(): Date;
  monotonicNow(): number;
}

export interface ConversationEngineObservabilityOptions {
  readonly toolExecution?:
    | ToolExecutionObserver
    | readonly ToolExecutionObserver[];
  readonly clock?: ToolExecutionClock;
  readonly redactor?: Readonly<ToolExecutionRedactor>;
}

export interface ToolExecutionRedactionContext {
  readonly phase: "started" | "completed";
  readonly conversationId: string;
  readonly turnId: string;
  readonly providerRound: number;
  readonly executionIndex: number;
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface ToolExecutionRedactor {
  redactArguments?(
    argumentsValue: Readonly<JsonObject>,
    context: Readonly<ToolExecutionRedactionContext>,
  ): Readonly<JsonObject>;
  redactResult?(
    result: Readonly<ToolResult>,
    context: Readonly<ToolExecutionRedactionContext>,
  ): Readonly<ToolResult>;
}

export interface ToolExecutionCorrelation {
  readonly conversationId: string;
  readonly turnId: string;
  readonly providerRound: number;
  readonly executionIndex: number;
}
