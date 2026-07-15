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
  OllamaRequestOptions,
  OllamaVersion,
} from "@agentforge/ollama-client";
import {
  ProviderRequestError,
  healthyProvider,
  throwIfProviderRequestAborted,
  unavailableProvider,
  validateLLMGenerationRequest,
  validateProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
  ProviderHealth,
  ProviderMetadata,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type { OllamaLLMProviderOptions } from "./OllamaLLMProviderOptions.js";
import { mapOllamaClientError } from "./errors/mapOllamaClientError.js";
import {
  mapGenerationRequest,
  mapRequestOptions,
} from "./internal/mapGenerationRequest.js";
import { mapGenerationResponse } from "./internal/mapGenerationResponse.js";

const DEFAULT_NAME = "ollama";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_DESCRIPTION = "Local Ollama large language model provider.";

interface CompatibleOllamaClient {
  getVersion(options?: OllamaRequestOptions): Promise<OllamaVersion>;
  chat(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): Promise<OllamaChatResponse>;
}

export class OllamaLLMProvider implements LLMProvider {
  readonly metadata: Readonly<ProviderMetadata>;
  private readonly client: CompatibleOllamaClient;

  constructor(options?: OllamaLLMProviderOptions) {
    const value = validateOptionsObject(options);
    const name = readOption(value, "name", DEFAULT_NAME);
    const version = readOption(value, "version", DEFAULT_VERSION);
    const description = readOption(value, "description", DEFAULT_DESCRIPTION);
    const resolvedName = resolveProviderName(name);

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
          "client must expose callable getVersion and chat methods",
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

    try {
      const version = await this.client.getVersion(mapRequestOptions(options));
      return healthyProvider(`Ollama ${version.version} is available.`);
    } catch (error) {
      if (
        error instanceof OllamaConnectionError ||
        error instanceof OllamaHttpError ||
        error instanceof OllamaResponseError
      ) {
        return unavailableProvider("Ollama is unavailable.");
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
    throwIfProviderRequestAborted(this.metadata.name, request.request);
    const mapped = mapGenerationRequest(request);

    try {
      const response = await this.client.chat(mapped.request, mapped.options);
      return mapGenerationResponse(response);
    } catch (error) {
      throw mapOllamaClientError(this.metadata.name, error);
    }
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
    typeof value.chat === "function"
  );
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
