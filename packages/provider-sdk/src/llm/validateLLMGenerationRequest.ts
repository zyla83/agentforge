import type { ProviderRequestOptions } from "../ProviderRequestOptions.js";
import { validateProviderRequestOptions } from "../ProviderRequestOptions.js";
import { ProviderRequestError } from "../errors/index.js";
import type { LLMGenerationRequest } from "./LLMGenerationRequest.js";
import { LLMMessageRole } from "./LLMMessage.js";
import { InvalidLLMRequestError } from "./errors/index.js";

const SUPPORTED_MESSAGE_ROLES = new Set<string>(Object.values(LLMMessageRole));
const MAX_STOP_SEQUENCES = 16;

export function validateLLMGenerationRequest(
  request: LLMGenerationRequest,
): void {
  const requestValue: unknown = request;

  if (!isRecord(requestValue)) {
    throw new InvalidLLMRequestError(["request: must be an object"]);
  }

  const details: string[] = [];
  let providerRequestError: ProviderRequestError | undefined;

  validateModel(requestValue.model, details);
  validateMessages(requestValue.messages, details);
  validateGenerationOptions(requestValue.generation, details);

  const requestOptions = requestValue.request;
  if (requestOptions !== undefined) {
    if (!isRecord(requestOptions)) {
      details.push("request: must be an object");
    } else {
      try {
        validateProviderRequestOptions(
          requestOptions as unknown as ProviderRequestOptions,
        );
      } catch (error) {
        if (error instanceof ProviderRequestError) {
          details.push("request.timeoutMs: must be a positive finite integer");
          providerRequestError = error;
        } else {
          throw error;
        }
      }
    }
  }

  if (details.length === 0) {
    return;
  }

  throw new InvalidLLMRequestError(
    details,
    providerRequestError ? { cause: providerRequestError } : undefined,
  );
}

function validateModel(value: unknown, details: string[]): void {
  if (typeof value !== "string") {
    details.push("model: must be a non-empty string");
    return;
  }

  if (value.trim().length === 0) {
    details.push("model: must contain at least one non-whitespace character");
  }
}

function validateMessages(value: unknown, details: string[]): void {
  if (!Array.isArray(value)) {
    details.push("messages: must be an array");
    return;
  }

  if (value.length === 0) {
    details.push("messages: must contain at least one message");
    return;
  }

  for (const [index, message] of value.entries()) {
    if (!isRecord(message)) {
      details.push(`messages[${index}]: must be an object`);
      continue;
    }

    if (
      typeof message.role !== "string" ||
      !SUPPORTED_MESSAGE_ROLES.has(message.role)
    ) {
      details.push(`messages[${index}].role: unsupported role`);
    }

    if (
      typeof message.content !== "string" ||
      message.content.trim().length === 0
    ) {
      details.push(`messages[${index}].content: must be a non-empty string`);
    }
  }
}

function validateGenerationOptions(value: unknown, details: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    details.push("generation: must be an object");
    return;
  }

  const { temperature, topP, maxTokens, stop } = value;

  if (
    temperature !== undefined &&
    (!isFiniteNumber(temperature) || temperature < 0 || temperature > 2)
  ) {
    details.push("generation.temperature: must be between 0 and 2");
  }

  if (topP !== undefined && (!isFiniteNumber(topP) || topP <= 0 || topP > 1)) {
    details.push("generation.topP: must be greater than 0 and at most 1");
  }

  if (
    maxTokens !== undefined &&
    (!isFiniteNumber(maxTokens) ||
      !Number.isInteger(maxTokens) ||
      maxTokens <= 0)
  ) {
    details.push("generation.maxTokens: must be a positive finite integer");
  }

  validateStopSequences(stop, details);
}

function validateStopSequences(value: unknown, details: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    details.push("generation.stop: must be an array");
    return;
  }

  if (value.length === 0) {
    details.push("generation.stop: must contain at least one stop sequence");
    return;
  }

  if (value.length > MAX_STOP_SEQUENCES) {
    details.push("generation.stop: must contain at most 16 stop sequences");
  }

  for (const [index, stopSequence] of value.entries()) {
    if (typeof stopSequence !== "string" || stopSequence.trim().length === 0) {
      details.push(`generation.stop[${index}]: must be a non-empty string`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
