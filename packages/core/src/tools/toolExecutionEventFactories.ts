import { createToolCall, createToolResult } from "@agentforge/provider-sdk";
import type { ToolCall, ToolResult } from "@agentforge/provider-sdk";
import type {
  ToolExecutionCompletedEvent,
  ToolExecutionCorrelation,
  ToolExecutionEventContext,
  ToolExecutionStartedEvent,
} from "./ToolExecutionObservability.js";
import type { ToolExecutionRecord } from "./ToolExecutor.js";

export function createToolExecutionEventContext(
  correlation: Readonly<ToolExecutionCorrelation>,
  call: Readonly<ToolCall>,
): Readonly<ToolExecutionEventContext> {
  requireIdentifier(correlation.conversationId, "conversationId");
  requireIdentifier(correlation.turnId, "turnId");
  requirePositiveInteger(correlation.providerRound, "providerRound");
  requirePositiveInteger(correlation.executionIndex, "executionIndex");
  requireIdentifier(call.id, "toolCallId");
  requireIdentifier(call.name, "toolName");
  return Object.freeze({
    conversationId: correlation.conversationId,
    turnId: correlation.turnId,
    providerRound: correlation.providerRound,
    executionIndex: correlation.executionIndex,
    toolCallId: call.id,
    toolName: call.name,
  });
}

export function createToolExecutionStartedEvent(input: {
  readonly context: Readonly<ToolExecutionEventContext>;
  readonly call: Readonly<ToolCall>;
  readonly startedAt: string;
}): Readonly<ToolExecutionStartedEvent> {
  requireTimestamp(input.startedAt, "startedAt");
  const context = snapshotContext(input.context);
  const call = snapshotCall(input.call);
  return Object.freeze({
    type: "tool-execution-started",
    context,
    call,
    startedAt: input.startedAt,
  });
}

export function createToolExecutionCompletedEvent(input: {
  readonly context: Readonly<ToolExecutionEventContext>;
  readonly call: Readonly<ToolCall>;
  readonly result: Readonly<ToolResult>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}): Readonly<ToolExecutionCompletedEvent> {
  validateCompletion(input);
  return Object.freeze({
    type: "tool-execution-completed",
    context: snapshotContext(input.context),
    call: snapshotCall(input.call),
    result: snapshotResult(input.result),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
  });
}

export function createToolExecutionRecord(input: {
  readonly context: Readonly<ToolExecutionEventContext>;
  readonly call: Readonly<ToolCall>;
  readonly result: Readonly<ToolResult>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}): Readonly<ToolExecutionRecord> {
  validateCompletion(input);
  return Object.freeze({
    context: snapshotContext(input.context),
    call: snapshotCall(input.call),
    result: snapshotResult(input.result),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
  });
}

function snapshotContext(
  context: Readonly<ToolExecutionEventContext>,
): Readonly<ToolExecutionEventContext> {
  requireIdentifier(context.conversationId, "conversationId");
  requireIdentifier(context.turnId, "turnId");
  requirePositiveInteger(context.providerRound, "providerRound");
  requirePositiveInteger(context.executionIndex, "executionIndex");
  requireIdentifier(context.toolCallId, "toolCallId");
  requireIdentifier(context.toolName, "toolName");
  return Object.isFrozen(context) ? context : Object.freeze({ ...context });
}

function snapshotCall(call: Readonly<ToolCall>): Readonly<ToolCall> {
  return Object.isFrozen(call) ? call : createToolCall(call);
}

function snapshotResult(result: Readonly<ToolResult>): Readonly<ToolResult> {
  return Object.isFrozen(result) ? result : createToolResult(result);
}

function validateCompletion(input: {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}): void {
  requireTimestamp(input.startedAt, "startedAt");
  requireTimestamp(input.completedAt, "completedAt");
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new TypeError("durationMs must be a finite non-negative number.");
  }
}

function requireIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive safe integer.`);
  }
}

function requireTimestamp(value: string, field: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${field} must be a valid ISO 8601 timestamp.`);
  }
}
