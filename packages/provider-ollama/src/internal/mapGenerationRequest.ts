import type {
  OllamaChatMessage,
  OllamaChatOptions,
  OllamaChatRequest,
  OllamaRequestOptions,
} from "@agentforge/ollama-client";
import type {
  LLMGenerationOptions,
  LLMGenerationRequest,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import { LLMMessageRole } from "@agentforge/provider-sdk";

export interface MappedGenerationRequest {
  readonly request: OllamaChatRequest;
  readonly options?: OllamaRequestOptions;
}

export function mapGenerationRequest(
  request: LLMGenerationRequest,
): MappedGenerationRequest {
  const mappedRequest: {
    model: string;
    messages: OllamaChatMessage[];
    options?: OllamaChatOptions;
  } = {
    model: request.model,
    messages: request.messages.map((message) => {
      if (message.role === LLMMessageRole.Tool || "toolCalls" in message) {
        throw new TypeError("Ollama tool message mapping is not implemented.");
      }
      return { role: message.role, content: message.content } as
        | Extract<OllamaChatMessage, { role: "system" }>
        | Extract<OllamaChatMessage, { role: "user" }>
        | Extract<OllamaChatMessage, { role: "assistant" }>;
    }),
  };

  if (request.generation !== undefined) {
    mappedRequest.options = mapGenerationOptions(request.generation);
  }

  const result: {
    request: OllamaChatRequest;
    options?: OllamaRequestOptions;
  } = { request: mappedRequest };
  const requestOptions = mapRequestOptions(request.request);
  if (requestOptions !== undefined) {
    result.options = requestOptions;
  }
  return result;
}

function mapGenerationOptions(
  generation: LLMGenerationOptions,
): OllamaChatOptions {
  const options: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: readonly string[];
  } = {};
  if (generation.temperature !== undefined) {
    options.temperature = generation.temperature;
  }
  if (generation.topP !== undefined) {
    options.top_p = generation.topP;
  }
  if (generation.maxTokens !== undefined) {
    options.num_predict = generation.maxTokens;
  }
  if (generation.stop !== undefined) {
    options.stop = [...generation.stop];
  }
  return options;
}

export function mapRequestOptions(
  request: ProviderRequestOptions | undefined,
): OllamaRequestOptions | undefined {
  if (request === undefined) {
    return undefined;
  }
  const options: { signal?: AbortSignal; timeoutMs?: number } = {};
  if (request.signal !== undefined) {
    options.signal = request.signal;
  }
  if (request.timeoutMs !== undefined) {
    options.timeoutMs = request.timeoutMs;
  }
  return Object.keys(options).length === 0 ? undefined : options;
}
