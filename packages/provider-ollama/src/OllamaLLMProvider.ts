import {
  OllamaAbortError,
  OllamaClient,
  OllamaConnectionError,
  OllamaHttpError,
  OllamaRequestError,
  OllamaResponseError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaChatStreamChunk,
  OllamaModel,
  OllamaRequestOptions,
  OllamaVersion,
} from "@agentforge/ollama-client";
import {
  ProviderError,
  ProviderRequestError,
  degradedProvider,
  healthyProvider,
  throwIfProviderRequestAborted,
  unavailableProvider,
  validateLLMGenerationRequest,
  validateProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProviderCapabilities,
  LLMStreamEvent,
  LLMStreamingProvider,
  ProviderHealth,
  ProviderMetadata,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type {
  OllamaHealthCheckOptions,
  OllamaHealthDetails,
  OllamaLLMProviderOptions,
} from "./OllamaLLMProviderOptions.js";
import { mapOllamaClientError } from "./errors/mapOllamaClientError.js";
import {
  mapGenerationRequest,
  mapRequestOptions,
} from "./internal/mapGenerationRequest.js";
import { mapGenerationResponse } from "./internal/mapGenerationResponse.js";

const DEFAULT_NAME = "ollama";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_DESCRIPTION = "Local Ollama large language model provider.";
type OllamaHealthDetailRecord = OllamaHealthDetails &
  Readonly<Record<string, unknown>>;

interface CompatibleOllamaClient {
  getVersion(options?: OllamaRequestOptions): Promise<OllamaVersion>;
  listModels(options?: OllamaRequestOptions): Promise<readonly OllamaModel[]>;
  chat(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): Promise<OllamaChatResponse>;
  chatStream(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): AsyncIterable<OllamaChatStreamChunk>;
  getBaseUrl?(): string;
}

export class OllamaLLMProvider implements LLMStreamingProvider {
  readonly metadata: Readonly<ProviderMetadata>;
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: true,
    tools: false,
  });
  private readonly client: CompatibleOllamaClient;
  private readonly healthCheck: Readonly<OllamaHealthCheckOptions> | undefined;

  constructor(options?: OllamaLLMProviderOptions) {
    const value = validateOptionsObject(options);
    const name = readOption(value, "name", DEFAULT_NAME);
    const version = readOption(value, "version", DEFAULT_VERSION);
    const description = readOption(value, "description", DEFAULT_DESCRIPTION);
    const resolvedName = resolveProviderName(name);
    this.healthCheck = snapshotHealthCheck(value.healthCheck, resolvedName);

    if (value.client !== undefined && value.clientOptions !== undefined) {
      throw configurationError(
        resolvedName,
        "client and clientOptions cannot both be provided",
      );
    }

    if (value.client !== undefined) {
      if (!isCompatibleClient(value.client)) {
        throw configurationError(
          resolvedName,
          "client must expose callable getVersion, listModels, chat, and chatStream methods",
        );
      }
      this.client = value.client;
    } else {
      try {
        this.client = new OllamaClient(
          value.clientOptions as OllamaLLMProviderOptions["clientOptions"],
        );
      } catch (error) {
        throw configurationError(
          resolvedName,
          "clientOptions are invalid",
          error,
        );
      }
    }

    this.metadata = Object.freeze({
      name,
      version,
      description,
    }) as Readonly<ProviderMetadata>;
  }

  async checkHealth(options?: ProviderRequestOptions): Promise<ProviderHealth> {
    validateProviderRequestOptions(options);
    validateHealthRequestOptions(this.metadata.name, options);
    throwIfProviderRequestAborted(this.metadata.name, options);
    const requestOptions = mapRequestOptions(options);
    const baseUrl = readSafeBaseUrl(this.client);
    const requiredModel = this.healthCheck?.model;

    try {
      const version = await this.client.getVersion(requestOptions);
      if (requiredModel === undefined) {
        return healthyProvider(
          `Ollama ${version.version} is available.`,
          createAvailableDetails(version.version, baseUrl),
        );
      }

      const models = await this.client.listModels(requestOptions);
      const modelAvailable = models.some(
        (model) =>
          model.name === requiredModel || model.model === requiredModel,
      );
      const details = createModelDetails(
        version.version,
        requiredModel,
        modelAvailable,
        models.length,
        baseUrl,
      );
      if (modelAvailable) {
        return healthyProvider(
          `Ollama ${version.version} is available and model "${requiredModel}" is installed.`,
          details,
        );
      }
      return degradedProvider(
        `Ollama is available, but model "${requiredModel}" is not installed.`,
        details,
      );
    } catch (error) {
      if (
        error instanceof OllamaConnectionError ||
        error instanceof OllamaHttpError ||
        error instanceof OllamaResponseError
      ) {
        return unavailableProvider(
          "Ollama is unavailable.",
          createUnavailableDetails(requiredModel, baseUrl),
        );
      }
      if (
        error instanceof OllamaAbortError ||
        error instanceof OllamaTimeoutError ||
        error instanceof OllamaRequestError
      ) {
        throw mapOllamaClientError(this.metadata.name, error);
      }
      throw new ProviderRequestError(
        this.metadata.name,
        `Provider "${resolveProviderName(this.metadata.name)}" health check failed unexpectedly.`,
        { cause: error },
      );
    }
  }

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    validateLLMGenerationRequest(request);
    assertToolsUnsupported(this.metadata.name, request);
    throwIfProviderRequestAborted(this.metadata.name, request.request);
    const mapped = mapGenerationRequest(request);

    try {
      const response = await this.client.chat(mapped.request, mapped.options);
      return mapGenerationResponse(response);
    } catch (error) {
      throw mapOllamaClientError(this.metadata.name, error);
    }
  }

  async *stream(request: LLMGenerationRequest): AsyncIterable<LLMStreamEvent> {
    validateLLMGenerationRequest(request);
    assertToolsUnsupported(this.metadata.name, request);
    throwIfProviderRequestAborted(this.metadata.name, request.request);
    const mapped = mapGenerationRequest(request);
    let model: string | undefined;
    let content = "";
    let completedResponse: Readonly<LLMGenerationResponse> | undefined;

    try {
      for await (const chunk of this.client.chatStream(
        mapped.request,
        mapped.options,
      )) {
        if (completedResponse !== undefined) {
          throw streamResponseError(
            this.metadata.name,
            "received data after stream completion",
          );
        }
        if (chunk.model !== undefined) {
          if (model !== undefined && chunk.model !== model) {
            throw streamResponseError(
              this.metadata.name,
              "received conflicting model names",
            );
          }
          model = chunk.model;
        }
        const resolvedModel = model ?? request.model;
        const delta = chunk.message?.content;
        if (delta !== undefined && delta.length > 0) {
          content += delta;
          yield Object.freeze({
            type: "delta",
            model: resolvedModel,
            delta,
          });
        }
        if (chunk.done) {
          completedResponse = mapGenerationResponse({
            model: resolvedModel,
            message: { role: "assistant", content },
            done: true,
            ...(chunk.doneReason === undefined
              ? {}
              : { doneReason: chunk.doneReason }),
            ...(chunk.promptEvalCount === undefined
              ? {}
              : { promptEvalCount: chunk.promptEvalCount }),
            ...(chunk.evalCount === undefined
              ? {}
              : { evalCount: chunk.evalCount }),
          });
        }
      }
      if (completedResponse === undefined) {
        throw streamResponseError(
          this.metadata.name,
          "stream ended before completion",
        );
      }
      yield Object.freeze({
        type: "completed",
        response: completedResponse,
      });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw mapOllamaClientError(this.metadata.name, error);
    }
  }
}

function assertToolsUnsupported(
  providerName: string,
  request: LLMGenerationRequest,
): void {
  if (
    request.tools !== undefined ||
    request.messages.some(
      (message) => message.role === "tool" || "toolCalls" in message,
    )
  ) {
    throw new ProviderRequestError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" does not support tool calling.`,
    );
  }
}

function validateOptionsObject(
  options: OllamaLLMProviderOptions | undefined,
): Record<string, unknown> {
  if (options === undefined) return {};
  if (!isRecord(options)) {
    throw configurationError(DEFAULT_NAME, "options must be an object");
  }
  return options;
}

function readOption(
  options: Record<string, unknown>,
  name: string,
  fallback: unknown,
): unknown {
  return options[name] === undefined ? fallback : options[name];
}

function isCompatibleClient(value: unknown): value is CompatibleOllamaClient {
  return (
    isRecord(value) &&
    typeof value.getVersion === "function" &&
    typeof value.listModels === "function" &&
    typeof value.chat === "function" &&
    typeof value.chatStream === "function"
  );
}

function streamResponseError(
  providerName: string,
  detail: string,
): ProviderRequestError {
  return new ProviderRequestError(
    providerName,
    `Provider "${resolveProviderName(providerName)}" ${detail}.`,
  );
}

function snapshotHealthCheck(
  value: unknown,
  providerName: string,
): Readonly<OllamaHealthCheckOptions> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw configurationError(providerName, "healthCheck must be an object");
  }
  if (
    value.model !== undefined &&
    (typeof value.model !== "string" || value.model.trim().length === 0)
  ) {
    throw configurationError(
      providerName,
      "healthCheck.model must be a non-empty string",
    );
  }
  const snapshot: { model?: string } = {};
  if (typeof value.model === "string") snapshot.model = value.model;
  return Object.freeze(snapshot);
}

function readSafeBaseUrl(client: CompatibleOllamaClient): string | undefined {
  try {
    const getBaseUrl = client.getBaseUrl;
    if (typeof getBaseUrl !== "function") return undefined;
    const value: unknown = getBaseUrl.call(client);
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function createAvailableDetails(
  version: string,
  baseUrl: string | undefined,
): OllamaHealthDetailRecord {
  const details: {
    serverAvailable: true;
    version: string;
    baseUrl?: string;
  } = { serverAvailable: true, version };
  if (baseUrl !== undefined) details.baseUrl = baseUrl;
  return details as OllamaHealthDetailRecord;
}

function createModelDetails(
  version: string,
  requiredModel: string,
  modelAvailable: boolean,
  installedModelCount: number,
  baseUrl: string | undefined,
): OllamaHealthDetailRecord {
  const details: {
    serverAvailable: true;
    version: string;
    requiredModel: string;
    modelAvailable: boolean;
    installedModelCount: number;
    baseUrl?: string;
  } = {
    serverAvailable: true,
    version,
    requiredModel,
    modelAvailable,
    installedModelCount,
  };
  if (baseUrl !== undefined) details.baseUrl = baseUrl;
  return details as OllamaHealthDetailRecord;
}

function createUnavailableDetails(
  requiredModel: string | undefined,
  baseUrl: string | undefined,
): OllamaHealthDetailRecord {
  const details: {
    serverAvailable: false;
    requiredModel?: string;
    baseUrl?: string;
  } = { serverAvailable: false };
  if (requiredModel !== undefined) details.requiredModel = requiredModel;
  if (baseUrl !== undefined) details.baseUrl = baseUrl;
  return details as OllamaHealthDetailRecord;
}

function configurationError(
  providerName: string,
  detail: string,
  cause?: unknown,
): ProviderRequestError {
  const options = cause === undefined ? undefined : { cause };
  return new ProviderRequestError(
    providerName,
    `Provider "${resolveProviderName(providerName)}" configuration is invalid: ${detail}.`,
    options,
  );
}

function validateHealthRequestOptions(
  providerName: string,
  options: ProviderRequestOptions | undefined,
): void {
  if (options === undefined) return;
  if (!isRecord(options)) {
    throw new ProviderRequestError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" request options must be an object.`,
    );
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new ProviderRequestError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" request signal must be an AbortSignal.`,
    );
  }
}

function resolveProviderName(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "<unknown>";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
