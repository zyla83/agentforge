import type {
  OllamaChatResponse,
  OllamaToolCall,
} from "@agentforge/ollama-client";
import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderRequestError,
  ProviderResponseError,
  createLLMTokenUsage,
  createToolCall,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationResponse,
  LLMTokenUsage,
  ToolCall,
} from "@agentforge/provider-sdk";
import { mapFinishReason } from "./mapFinishReason.js";
import { mapOllamaJsonObject } from "./mapJson.js";

export interface MapGenerationResponseOptions {
  readonly generationSequence: number;
  readonly providerName: string;
}

export function mapGenerationResponse(
  response: OllamaChatResponse,
  options: MapGenerationResponseOptions,
): Readonly<LLMGenerationResponse> {
  const usage = mapTokenUsage(response);
  if ("toolCalls" in response.message) {
    if (response.message.content.length > 0) {
      throw new ProviderResponseError(
        options.providerName,
        `Provider "${resolveProviderName(options.providerName)}" returned assistant text together with tool calls.`,
      );
    }
    const message = Object.freeze({
      role: LLMMessageRole.Assistant,
      content: "",
      toolCalls: mapOllamaToolCalls(
        response.message.toolCalls,
        options.generationSequence,
        options.providerName,
      ),
    });
    return Object.freeze({
      model: response.model,
      message,
      finishReason: LLMFinishReason.ToolCalls,
      ...(usage === undefined ? {} : { usage }),
    });
  }

  const message = Object.freeze({
    role: LLMMessageRole.Assistant,
    content: response.message.content,
  });
  return Object.freeze({
    model: response.model,
    message,
    finishReason: mapFinishReason(response.done, response.doneReason),
    ...(usage === undefined ? {} : { usage }),
  });
}

function mapOllamaToolCalls(
  calls: readonly Readonly<OllamaToolCall>[],
  generationSequence: number,
  providerName: string,
): readonly Readonly<ToolCall>[] {
  validateGenerationSequence(generationSequence, providerName);
  try {
    return Object.freeze(
      calls.map((call, index) =>
        createToolCall({
          id: createOllamaToolCallId(generationSequence, index + 1),
          name: call.function.name,
          arguments: mapOllamaJsonObject(call.function.arguments),
        }),
      ),
    );
  } catch (error) {
    throw new ProviderResponseError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" returned invalid tool call data.`,
      { cause: error },
    );
  }
}

function createOllamaToolCallId(
  generationSequence: number,
  callIndex: number,
): string {
  return `ollama-${generationSequence}-call-${callIndex}`;
}

function validateGenerationSequence(
  sequence: number,
  providerName: string,
): void {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new ProviderRequestError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" generation sequence is invalid.`,
    );
  }
}

function mapTokenUsage(
  response: OllamaChatResponse,
): Readonly<LLMTokenUsage> | undefined {
  if (
    response.promptEvalCount === undefined &&
    response.evalCount === undefined
  ) {
    return undefined;
  }
  return createLLMTokenUsage(
    response.promptEvalCount ?? 0,
    response.evalCount ?? 0,
  );
}

function resolveProviderName(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "<unknown>";
}
