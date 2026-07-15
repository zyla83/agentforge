import {
  InvalidLLMRequestError,
  LLMFinishReason,
  LLMMessageRole,
  ProviderHealthStatus,
  healthyProvider,
  throwIfProviderRequestAborted,
  validateLLMGenerationRequest,
  validateProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationOptions,
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMMessage,
  LLMProvider,
  ProviderHealth,
  ProviderMetadata,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type { MockLLMProviderOptions } from "./MockLLMProviderOptions.js";

const DEFAULT_NAME = "mock-llm";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_DESCRIPTION = "Deterministic mock LLM provider.";
const DEFAULT_RESPONSE_CONTENT = "Mock response";
const SUPPORTED_FINISH_REASONS = new Set<string>(
  Object.values(LLMFinishReason),
);
const SUPPORTED_HEALTH_STATUSES = new Set<string>(
  Object.values(ProviderHealthStatus),
);

export class MockLLMProvider implements LLMProvider {
  readonly metadata: Readonly<ProviderMetadata>;
  private readonly responseContent: string;
  private readonly finishReason: LLMFinishReason;
  private readonly health: ProviderHealth;
  private readonly requests: Readonly<LLMGenerationRequest>[] = [];

  constructor(options?: MockLLMProviderOptions) {
    const optionsValue = validateOptionsObject(options);
    const name = readOption(optionsValue, "name", DEFAULT_NAME);
    const version = readOption(optionsValue, "version", DEFAULT_VERSION);
    const description = readOption(
      optionsValue,
      "description",
      DEFAULT_DESCRIPTION,
    );
    const responseContent = readOption(
      optionsValue,
      "responseContent",
      DEFAULT_RESPONSE_CONTENT,
    );
    const finishReason = readOption(
      optionsValue,
      "finishReason",
      LLMFinishReason.Stop,
    );
    const health = readOption(
      optionsValue,
      "health",
      healthyProvider("Mock provider is ready."),
    );

    if (
      typeof responseContent !== "string" ||
      responseContent.trim().length === 0
    ) {
      throw new InvalidLLMRequestError([
        "responseContent: must be a non-empty string",
      ]);
    }

    if (
      typeof finishReason !== "string" ||
      !SUPPORTED_FINISH_REASONS.has(finishReason)
    ) {
      throw new InvalidLLMRequestError([
        "finishReason: unsupported finish reason",
      ]);
    }

    this.metadata = Object.freeze({
      name,
      version,
      description,
    }) as Readonly<ProviderMetadata>;
    this.responseContent = responseContent;
    this.finishReason = finishReason as LLMFinishReason;
    this.health = snapshotHealth(health);
  }

  async checkHealth(options?: ProviderRequestOptions): Promise<ProviderHealth> {
    validateProviderRequestOptions(options);
    throwIfProviderRequestAborted(this.metadata.name, options);
    return this.health;
  }

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    validateLLMGenerationRequest(request);
    throwIfProviderRequestAborted(this.metadata.name, request.request);

    const requestSnapshot = snapshotRequest(request);
    this.requests.push(requestSnapshot);

    const message = Object.freeze({
      role: LLMMessageRole.Assistant,
      content: this.responseContent,
    });

    return Object.freeze({
      model: request.model,
      message,
      finishReason: this.finishReason,
    });
  }

  getRequests(): readonly Readonly<LLMGenerationRequest>[] {
    return Object.freeze([...this.requests]);
  }

  clearRequests(): void {
    this.requests.length = 0;
  }
}

function validateOptionsObject(
  options: MockLLMProviderOptions | undefined,
): Record<string, unknown> {
  if (options === undefined) {
    return {};
  }

  if (!isRecord(options)) {
    throw new InvalidLLMRequestError([
      "options: must be an object when provided",
    ]);
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

function snapshotHealth(value: unknown): ProviderHealth {
  if (!isRecord(value)) {
    throw new InvalidLLMRequestError(["health: must be an object"]);
  }

  const { status, message, details } = value;
  const validationDetails: string[] = [];

  if (typeof status !== "string" || !SUPPORTED_HEALTH_STATUSES.has(status)) {
    validationDetails.push("health.status: unsupported status");
  }

  if (message !== undefined && typeof message !== "string") {
    validationDetails.push("health.message: must be a string");
  }

  if (details !== undefined && !isRecord(details)) {
    validationDetails.push("health.details: must be an object");
  }

  if (validationDetails.length > 0) {
    throw new InvalidLLMRequestError(validationDetails);
  }

  const snapshot: {
    status: ProviderHealthStatus;
    message?: string;
    details?: Readonly<Record<string, unknown>>;
  } = { status: status as ProviderHealthStatus };

  if (typeof message === "string") {
    snapshot.message = message;
  }

  if (isRecord(details)) {
    snapshot.details = Object.freeze({ ...details });
  }

  return Object.freeze(snapshot);
}

function snapshotRequest(
  request: LLMGenerationRequest,
): Readonly<LLMGenerationRequest> {
  const snapshot: {
    model: string;
    messages: readonly Readonly<LLMMessage>[];
    generation?: Readonly<LLMGenerationOptions>;
    request?: Readonly<ProviderRequestOptions>;
  } = {
    model: request.model,
    messages: Object.freeze(
      request.messages.map((message) => Object.freeze({ ...message })),
    ),
  };

  if (request.generation !== undefined) {
    snapshot.generation = snapshotGenerationOptions(request.generation);
  }

  if (request.request !== undefined) {
    snapshot.request = snapshotRequestOptions(request.request);
  }

  return Object.freeze(snapshot);
}

function snapshotGenerationOptions(
  generation: LLMGenerationOptions,
): Readonly<LLMGenerationOptions> {
  const snapshot: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stop?: readonly string[];
  } = {};

  if (generation.temperature !== undefined) {
    snapshot.temperature = generation.temperature;
  }

  if (generation.topP !== undefined) {
    snapshot.topP = generation.topP;
  }

  if (generation.maxTokens !== undefined) {
    snapshot.maxTokens = generation.maxTokens;
  }

  if (generation.stop !== undefined) {
    snapshot.stop = Object.freeze([...generation.stop]);
  }

  return Object.freeze(snapshot);
}

function snapshotRequestOptions(
  options: ProviderRequestOptions,
): Readonly<ProviderRequestOptions> {
  const snapshot: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {};

  if (options.signal !== undefined) {
    snapshot.signal = options.signal;
  }

  if (options.timeoutMs !== undefined) {
    snapshot.timeoutMs = options.timeoutMs;
  }

  return Object.freeze(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
