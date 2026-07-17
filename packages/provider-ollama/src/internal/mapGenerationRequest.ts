import type {
  OllamaChatMessage,
  OllamaChatOptions,
  OllamaChatRequest,
  OllamaRequestOptions,
  OllamaTool,
} from "@agentforge/ollama-client";
import {
  type LLMGenerationOptions,
  type LLMGenerationRequest,
  type LLMMessage,
  LLMMessageRole,
  type ProviderRequestOptions,
  type ToolDefinition,
} from "@agentforge/provider-sdk";
import { mapJsonObjectToOllama } from "./mapJson.js";

export interface MappedGenerationRequest {
  readonly request: OllamaChatRequest;
  readonly options?: OllamaRequestOptions;
}

export function mapGenerationRequest(
  request: LLMGenerationRequest,
): MappedGenerationRequest {
  const mappedRequest: {
    model: string;
    messages: readonly Readonly<OllamaChatMessage>[];
    tools?: readonly Readonly<OllamaTool>[];
    options?: Readonly<OllamaChatOptions>;
  } = {
    model: request.model,
    messages: Object.freeze(request.messages.map(mapGenerationMessage)),
  };

  if (request.tools !== undefined) {
    mappedRequest.tools = Object.freeze(request.tools.map(mapToolDefinition));
  }
  if (request.generation !== undefined) {
    mappedRequest.options = mapGenerationOptions(request.generation);
  }

  const result: {
    request: OllamaChatRequest;
    options?: OllamaRequestOptions;
  } = { request: Object.freeze(mappedRequest) };
  const requestOptions = mapRequestOptions(request.request);
  if (requestOptions !== undefined) result.options = requestOptions;
  return Object.freeze(result);
}

export function mapToolDefinition(
  definition: Readonly<ToolDefinition>,
): Readonly<OllamaTool> {
  const fn: {
    name: string;
    description?: string;
    parameters: ReturnType<typeof mapJsonObjectToOllama>;
  } = {
    name: definition.name,
    parameters: mapJsonObjectToOllama(definition.inputSchema),
  };
  if (definition.description !== undefined) {
    fn.description = definition.description;
  }
  return Object.freeze({ type: "function", function: Object.freeze(fn) });
}

function mapGenerationMessage(
  message: Readonly<LLMMessage>,
): Readonly<OllamaChatMessage> {
  switch (message.role) {
    case LLMMessageRole.System:
      return Object.freeze({ role: "system", content: message.content });
    case LLMMessageRole.User:
      return Object.freeze({ role: "user", content: message.content });
    case LLMMessageRole.Assistant:
      if ("toolCalls" in message) {
        return Object.freeze({
          role: "assistant",
          content: message.content,
          toolCalls: Object.freeze(
            message.toolCalls.map((call) =>
              Object.freeze({
                function: Object.freeze({
                  name: call.name,
                  arguments: mapJsonObjectToOllama(call.arguments),
                }),
              }),
            ),
          ),
        });
      }
      return Object.freeze({ role: "assistant", content: message.content });
    case LLMMessageRole.Tool:
      return Object.freeze({ role: "tool", content: message.content });
  }
}

function mapGenerationOptions(
  generation: LLMGenerationOptions,
): Readonly<OllamaChatOptions> {
  const options: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: readonly string[];
  } = {};
  if (generation.temperature !== undefined) {
    options.temperature = generation.temperature;
  }
  if (generation.topP !== undefined) options.top_p = generation.topP;
  if (generation.maxTokens !== undefined) {
    options.num_predict = generation.maxTokens;
  }
  if (generation.stop !== undefined) {
    options.stop = Object.freeze([...generation.stop]);
  }
  return Object.freeze(options);
}

export function mapRequestOptions(
  request: ProviderRequestOptions | undefined,
): OllamaRequestOptions | undefined {
  if (request === undefined) return undefined;
  const options: { signal?: AbortSignal; timeoutMs?: number } = {};
  if (request.signal !== undefined) options.signal = request.signal;
  if (request.timeoutMs !== undefined) options.timeoutMs = request.timeoutMs;
  return Object.keys(options).length === 0 ? undefined : Object.freeze(options);
}
