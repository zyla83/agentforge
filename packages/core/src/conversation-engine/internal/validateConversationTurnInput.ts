import {
  InvalidLLMRequestError,
  LLMMessageRole,
  validateLLMGenerationRequest,
} from "@agentforge/provider-sdk";
import type { ConversationTurnInput } from "../ConversationTurnInput.js";
import { InvalidConversationTurnError } from "../errors/index.js";

interface ProviderOptionsValidation {
  readonly details: readonly string[];
  readonly cause?: InvalidLLMRequestError;
}

export function validateConversationTurnInput(
  input: ConversationTurnInput,
): void {
  const value: unknown = input;
  if (!isRecord(value)) {
    throw new InvalidConversationTurnError(["turn: must be an object"]);
  }

  const details: string[] = [];
  if (value.conversation === undefined) {
    details.push("conversation: is required");
  }
  const validContent = isNonEmptyString(value.content);
  if (!validContent) {
    details.push("content: must be a non-empty string");
  }
  const validModel = value.model === undefined || isNonEmptyString(value.model);
  if (!validModel) {
    details.push("model: must be a non-empty string when provided");
  }
  if (value.provider !== undefined && !isNonEmptyString(value.provider)) {
    details.push("provider: must be a non-empty string when provided");
  }
  if (
    value.tools !== undefined &&
    typeof value.tools !== "boolean" &&
    !Array.isArray(value.tools)
  ) {
    details.push("tools: must be a boolean or an array of tool names");
  } else if (Array.isArray(value.tools)) {
    if (value.tools.length === 0)
      details.push("tools: must contain at least one tool name");
    const names = new Set<string>();
    value.tools.forEach((name, index) => {
      if (!isNonEmptyString(name))
        details.push(`tools[${index}]: must be a non-empty string`);
      else if (names.has(name))
        details.push(`tools[${index}]: duplicate tool name "${name}"`);
      else names.add(name);
    });
  }

  const providerValidation = validateProviderOptions(
    isNonEmptyString(value.model) ? value.model : "validation-model",
    validContent ? value.content : "validation-content",
    value.generation,
    value.request,
  );
  details.push(...providerValidation.details);

  if (details.length > 0) {
    throw new InvalidConversationTurnError(
      details,
      providerValidation.cause === undefined
        ? undefined
        : { cause: providerValidation.cause },
    );
  }
}

function validateProviderOptions(
  model: unknown,
  content: unknown,
  generation: unknown,
  request: unknown,
): ProviderOptionsValidation {
  const details: string[] = [];
  let cause: InvalidLLMRequestError | undefined;
  try {
    validateLLMGenerationRequest({
      model: model as string,
      messages: [{ role: LLMMessageRole.User, content: content as string }],
      ...(generation === undefined ? {} : { generation: generation as never }),
      ...(request === undefined ? {} : { request: request as never }),
    });
  } catch (error) {
    if (!(error instanceof InvalidLLMRequestError)) throw error;
    cause = error;
    details.push(
      ...error.details.filter(
        (detail) =>
          detail.startsWith("generation:") ||
          detail.startsWith("generation.") ||
          detail.startsWith("request:") ||
          detail.startsWith("request."),
      ),
    );
  }

  if (
    isRecord(request) &&
    request.signal !== undefined &&
    !(request.signal instanceof AbortSignal)
  ) {
    details.push("request.signal: must be an AbortSignal");
  }
  return cause === undefined ? { details } : { details, cause };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
