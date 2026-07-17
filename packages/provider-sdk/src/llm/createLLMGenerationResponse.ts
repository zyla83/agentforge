import { createToolCall } from "../tools/index.js";
import type { LLMFinishReason } from "./LLMFinishReason.js";
import { LLMFinishReason as FinishReason } from "./LLMFinishReason.js";
import type { LLMGenerationResponse } from "./LLMGenerationResponse.js";
import { LLMMessageRole } from "./LLMMessage.js";
import { createLLMTokenUsage } from "./LLMTokenUsage.js";
import { InvalidLLMResponseError } from "./errors/index.js";

const RESPONSE_KEYS = new Set(["model", "message", "finishReason", "usage"]);
const TEXT_MESSAGE_KEYS = new Set(["role", "content"]);
const TOOL_MESSAGE_KEYS = new Set(["role", "content", "toolCalls"]);
const FINISH_REASONS = new Set<string>(Object.values(FinishReason));

export function createLLMGenerationResponse(
  response: LLMGenerationResponse,
): Readonly<LLMGenerationResponse> {
  const value: unknown = response;
  const details: string[] = [];
  if (!isRecord(value))
    throw new InvalidLLMResponseError(["response: must be an object"]);
  rejectUnknown(value, RESPONSE_KEYS, "response", details);
  if (typeof value.model !== "string" || value.model.trim().length === 0) {
    details.push("model: must be a non-empty string");
  }
  if (
    typeof value.finishReason !== "string" ||
    !FINISH_REASONS.has(value.finishReason)
  ) {
    details.push("finishReason: unsupported finish reason");
  }

  const message = snapshotAssistantMessage(
    value.message,
    value.finishReason,
    details,
  );
  const usage = snapshotUsage(value.usage, details);
  if (details.length > 0 || message === undefined) {
    throw new InvalidLLMResponseError(details);
  }
  return Object.freeze({
    model: value.model as string,
    message,
    finishReason: value.finishReason as LLMFinishReason,
    ...(usage === undefined ? {} : { usage }),
  });
}

export function validateLLMGenerationResponse(
  response: LLMGenerationResponse,
): void {
  createLLMGenerationResponse(response);
}

function snapshotAssistantMessage(
  value: unknown,
  finishReason: unknown,
  details: string[],
): LLMGenerationResponse["message"] | undefined {
  if (!isRecord(value)) {
    details.push("message: must be an object");
    return undefined;
  }
  if (value.role !== LLMMessageRole.Assistant) {
    details.push("message.role: must be assistant");
  }
  const hasToolCalls = Object.hasOwn(value, "toolCalls");
  rejectUnknown(
    value,
    hasToolCalls ? TOOL_MESSAGE_KEYS : TEXT_MESSAGE_KEYS,
    "message",
    details,
  );
  if (hasToolCalls) {
    if (finishReason !== FinishReason.ToolCalls) {
      details.push(
        "finishReason: must be tool_calls when message contains toolCalls",
      );
    }
    if (typeof value.content !== "string" || value.content.trim().length > 0) {
      details.push("message.content: must be empty for a tool-call response");
    }
    if (!Array.isArray(value.toolCalls) || value.toolCalls.length === 0) {
      details.push("message.toolCalls: must contain at least one tool call");
      return undefined;
    }
    const ids = new Set<string>();
    const calls = value.toolCalls.map((call, index) => {
      try {
        const snapshot = createToolCall(call as never);
        if (ids.has(snapshot.id)) {
          details.push(`message.toolCalls[${index}].id: must be unique`);
        }
        ids.add(snapshot.id);
        return snapshot;
      } catch {
        details.push(`message.toolCalls[${index}]: must be a valid tool call`);
        return undefined;
      }
    });
    if (calls.some((call) => call === undefined)) return undefined;
    return Object.freeze({
      role: LLMMessageRole.Assistant,
      content: value.content as string,
      toolCalls: Object.freeze(calls as NonNullable<(typeof calls)[number]>[]),
    });
  }
  if (finishReason === FinishReason.ToolCalls) {
    details.push(
      "message.toolCalls: is required when finishReason is tool_calls",
    );
  }
  if (typeof value.content !== "string" || value.content.trim().length === 0) {
    details.push("message.content: must be a non-empty string");
  }
  return Object.freeze({
    role: LLMMessageRole.Assistant,
    content: value.content as string,
  });
}

function snapshotUsage(value: unknown, details: string[]) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    details.push("usage: must be an object");
    return undefined;
  }
  rejectUnknown(
    value,
    new Set(["inputTokens", "outputTokens", "totalTokens"]),
    "usage",
    details,
  );
  try {
    const usage = createLLMTokenUsage(
      value.inputTokens as number,
      value.outputTokens as number,
    );
    if (value.totalTokens !== usage.totalTokens)
      details.push(
        "usage.totalTokens: must equal inputTokens plus outputTokens",
      );
    return usage;
  } catch {
    details.push("usage: must contain valid token counts");
    return undefined;
  }
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  details: string[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) details.push(`${path}.${key}: is not supported`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
