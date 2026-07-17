import type {
  OllamaAssistantMessage,
  OllamaChatMessage,
  OllamaChatOptions,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaChatStreamChunk,
  OllamaJsonObject,
  OllamaJsonValue,
  OllamaTool,
  OllamaToolCall,
} from "./OllamaChat.js";
import type {
  FetchImplementation,
  OllamaClientOptions,
} from "./OllamaClientOptions.js";
import type { OllamaModel, OllamaModelDetails } from "./OllamaModel.js";
import type { OllamaRequestOptions } from "./OllamaRequestOptions.js";
import type { OllamaVersion } from "./OllamaVersion.js";
import { OllamaAbortError } from "./errors/OllamaAbortError.js";
import { OllamaClientError } from "./errors/OllamaClientError.js";
import { OllamaConnectionError } from "./errors/OllamaConnectionError.js";
import { OllamaHttpError } from "./errors/OllamaHttpError.js";
import { OllamaRequestError } from "./errors/OllamaRequestError.js";
import { OllamaResponseError } from "./errors/OllamaResponseError.js";
import { OllamaTimeoutError } from "./errors/OllamaTimeoutError.js";
import { createCombinedAbortSignal } from "./internal/createCombinedAbortSignal.js";
import { parseJsonResponse } from "./internal/parseJsonResponse.js";
import { parseNdjsonStream } from "./internal/parseNdjsonStream.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT_MS = 30_000;
const CHAT_ROLES = new Set(["system", "user", "assistant", "tool"]);
const MESSAGE_PROPERTIES = new Set(["role", "content", "toolCalls"]);
const RESPONSE_MESSAGE_PROPERTIES = new Set(["role", "content", "tool_calls"]);

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options?: OllamaClientOptions) {
    const value = validateClientOptions(options);
    this.baseUrl = normalizeBaseUrl(value.baseUrl ?? DEFAULT_BASE_URL);
    this.defaultTimeoutMs = validateTimeout(
      value.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "defaultTimeoutMs",
    );

    const fetchImplementation = value.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new OllamaRequestError(["fetch: must be a function"]);
    }
    this.fetchImplementation = fetchImplementation as FetchImplementation;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getVersion(options?: OllamaRequestOptions): Promise<OllamaVersion> {
    const endpoint = "/api/version";
    const value = await this.requestJson(
      endpoint,
      { method: "GET", headers: { Accept: "application/json" } },
      options,
    );

    if (!isRecord(value) || !isNonEmptyString(value.version)) {
      throw new OllamaResponseError(endpoint, [
        "version: must be a non-empty string",
      ]);
    }

    return Object.freeze({ version: value.version });
  }

  async listModels(
    options?: OllamaRequestOptions,
  ): Promise<readonly OllamaModel[]> {
    const endpoint = "/api/tags";
    const value = await this.requestJson(
      endpoint,
      { method: "GET", headers: { Accept: "application/json" } },
      options,
    );

    if (!isRecord(value) || !Array.isArray(value.models)) {
      throw new OllamaResponseError(endpoint, ["models: must be an array"]);
    }

    return Object.freeze(
      value.models.map((model, index) => parseModel(model, endpoint, index)),
    );
  }

  async chat(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): Promise<OllamaChatResponse> {
    const validatedRequest = validateChatRequest(request);
    const endpoint = "/api/chat";
    const value = await this.requestJson(
      endpoint,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createChatBody(validatedRequest, false)),
      },
      options,
    );

    return parseChatResponse(value, endpoint);
  }

  async *chatStream(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): AsyncIterable<OllamaChatStreamChunk> {
    const validatedRequest = validateChatRequest(request);
    const endpoint = "/api/chat";
    const requestOptions = validateRequestOptions(options);
    const timeoutMs = requestOptions.timeoutMs ?? this.defaultTimeoutMs;
    const callerSignal = requestOptions.signal;

    if (isSignalAborted(callerSignal)) {
      throw new OllamaAbortError(
        endpoint,
        causeOptions(getAbortReason(callerSignal)),
      );
    }

    const url = this.createEndpointUrl(endpoint);
    const combined = createCombinedAbortSignal(callerSignal, timeoutMs);
    try {
      const fetchImplementation = this.fetchImplementation;
      const response = await fetchImplementation(url, {
        method: "POST",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createChatBody(validatedRequest, true)),
        signal: combined.signal,
      });

      if (!response.ok) {
        const serverMessage = await readHttpErrorMessage(response);
        throw new OllamaHttpError(
          endpoint,
          response.status,
          response.statusText,
          serverMessage,
        );
      }
      const contentType = response.headers.get("Content-Type");
      if (
        contentType === null ||
        contentType.split(";", 1)[0]?.trim().toLowerCase() !==
          "application/x-ndjson"
      ) {
        throw new OllamaResponseError(endpoint, [
          "content-type: must be application/x-ndjson",
        ]);
      }
      if (response.body === null) {
        throw new OllamaResponseError(endpoint, [
          "body: streaming response body is required",
        ]);
      }

      let completed = false;
      for await (const parsed of parseNdjsonStream(response.body, endpoint)) {
        if (completed) {
          throw new OllamaResponseError(endpoint, [
            `stream[${parsed.index}]: data is not allowed after completion`,
          ]);
        }
        if (isRecord(parsed.value) && "error" in parsed.value) {
          if (typeof parsed.value.error !== "string") {
            throw new OllamaResponseError(endpoint, [
              `stream[${parsed.index}].error: must be a string`,
            ]);
          }
          throw new OllamaHttpError(
            endpoint,
            response.status,
            response.statusText,
            parsed.value.error,
          );
        }
        const chunk = parseChatStreamChunk(
          parsed.value,
          endpoint,
          parsed.index,
        );
        if (chunk.done) completed = true;
        yield chunk;
      }
      if (!completed) {
        throw new OllamaResponseError(endpoint, [
          "stream: ended before a completed chunk",
        ]);
      }
    } catch (error) {
      if (isSignalAborted(callerSignal)) {
        throw new OllamaAbortError(
          endpoint,
          causeOptions(getAbortReason(callerSignal)),
        );
      }
      if (combined.didTimeout()) {
        throw new OllamaTimeoutError(endpoint, timeoutMs, { cause: error });
      }
      if (error instanceof OllamaClientError) throw error;
      throw new OllamaConnectionError(this.baseUrl, { cause: error });
    } finally {
      combined.cleanup();
    }
  }

  private async requestJson(
    endpoint: string,
    init: RequestInit,
    options?: OllamaRequestOptions,
  ): Promise<unknown> {
    const requestOptions = validateRequestOptions(options);
    const timeoutMs = requestOptions.timeoutMs ?? this.defaultTimeoutMs;
    const callerSignal = requestOptions.signal;

    if (isSignalAborted(callerSignal)) {
      throw new OllamaAbortError(
        endpoint,
        causeOptions(getAbortReason(callerSignal)),
      );
    }

    const url = this.createEndpointUrl(endpoint);
    const combined = createCombinedAbortSignal(callerSignal, timeoutMs);

    try {
      const fetchImplementation = this.fetchImplementation;
      const response = await fetchImplementation(url, {
        ...init,
        signal: combined.signal,
      });

      if (!response.ok) {
        const serverMessage = await readHttpErrorMessage(response);
        throw new OllamaHttpError(
          endpoint,
          response.status,
          response.statusText,
          serverMessage,
        );
      }

      return await parseJsonResponse(response, endpoint);
    } catch (error) {
      if (isSignalAborted(callerSignal)) {
        throw new OllamaAbortError(
          endpoint,
          causeOptions(getAbortReason(callerSignal)),
        );
      }
      if (combined.didTimeout()) {
        throw new OllamaTimeoutError(endpoint, timeoutMs, { cause: error });
      }
      if (error instanceof OllamaClientError) {
        throw error;
      }
      throw new OllamaConnectionError(this.baseUrl, { cause: error });
    } finally {
      combined.cleanup();
    }
  }

  private createEndpointUrl(endpoint: string): string {
    const base = new URL(`${this.baseUrl}/`);
    return new URL(endpoint.replace(/^\/+/, ""), base).toString();
  }
}

function validateClientOptions(
  options: OllamaClientOptions | undefined,
): Record<string, unknown> {
  if (options === undefined) {
    return {};
  }
  if (!isRecord(options)) {
    throw new OllamaRequestError(["options: must be an object when provided"]);
  }
  return options;
}

function normalizeBaseUrl(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new OllamaRequestError(["baseUrl: must be a non-empty string"]);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OllamaRequestError(["baseUrl: must be an absolute URL"]);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OllamaRequestError(["baseUrl: protocol must be http or https"]);
  }
  if (value.includes("?")) {
    throw new OllamaRequestError(["baseUrl: query strings are not supported"]);
  }
  if (value.includes("#")) {
    throw new OllamaRequestError(["baseUrl: fragments are not supported"]);
  }

  return parsed.toString().replace(/\/+$/, "");
}

function validateRequestOptions(
  options: OllamaRequestOptions | undefined,
): Readonly<OllamaRequestOptions> {
  if (options === undefined) {
    return {};
  }
  if (!isRecord(options)) {
    throw new OllamaRequestError([
      "request options: must be an object when provided",
    ]);
  }

  const result: { signal?: AbortSignal; timeoutMs?: number } = {};
  if (options.signal !== undefined) {
    if (!(options.signal instanceof AbortSignal)) {
      throw new OllamaRequestError([
        "request options.signal: must be an AbortSignal",
      ]);
    }
    result.signal = options.signal;
  }
  if (options.timeoutMs !== undefined) {
    result.timeoutMs = validateTimeout(
      options.timeoutMs,
      "request options.timeoutMs",
    );
  }
  return result;
}

function validateTimeout(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new OllamaRequestError([
      `${path}: must be a positive finite integer`,
    ]);
  }
  return value;
}

function validateChatRequest(
  request: OllamaChatRequest,
): Readonly<OllamaChatRequest> {
  if (!isRecord(request)) {
    throw new OllamaRequestError(["request: must be an object"]);
  }

  const details: string[] = [];
  if (!isNonEmptyString(request.model)) {
    details.push("model: must be a non-empty string");
  }

  const messages: Readonly<OllamaChatMessage>[] = [];
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    details.push("messages: must be a non-empty array");
  } else if (hasSparseSlots(request.messages)) {
    details.push("messages: must not be sparse");
  } else {
    request.messages.forEach((message, index) => {
      const snapshot = snapshotRequestMessage(
        message,
        `messages[${index}]`,
        details,
      );
      if (snapshot !== undefined) messages.push(snapshot);
    });
  }

  let tools: readonly Readonly<OllamaTool>[] | undefined;
  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools) || request.tools.length === 0) {
      details.push("tools: must be a non-empty array");
    } else if (hasSparseSlots(request.tools)) {
      details.push("tools: must not be sparse");
    } else {
      const names = new Set<string>();
      const snapshots: Readonly<OllamaTool>[] = [];
      request.tools.forEach((tool, index) => {
        const snapshot = snapshotTool(tool, `tools[${index}]`, details);
        if (snapshot === undefined) return;
        if (names.has(snapshot.function.name)) {
          details.push(
            `tools[${index}].function.name: duplicate tool name \"${snapshot.function.name}\"`,
          );
          return;
        }
        names.add(snapshot.function.name);
        snapshots.push(snapshot);
      });
      tools = Object.freeze(snapshots);
    }
  }

  let options: Readonly<OllamaChatOptions> | undefined;
  if (request.options !== undefined) {
    validateChatOptions(request.options, details);
    if (isRecord(request.options)) {
      const snapshot: {
        temperature?: number;
        top_p?: number;
        num_predict?: number;
        stop?: readonly string[];
      } = {};
      if (typeof request.options.temperature === "number") {
        snapshot.temperature = request.options.temperature;
      }
      if (typeof request.options.top_p === "number") {
        snapshot.top_p = request.options.top_p;
      }
      if (typeof request.options.num_predict === "number") {
        snapshot.num_predict = request.options.num_predict;
      }
      if (Array.isArray(request.options.stop)) {
        snapshot.stop = Object.freeze([...request.options.stop]) as string[];
      }
      options = Object.freeze(snapshot);
    }
  }

  if (details.length > 0) {
    throw new OllamaRequestError(details);
  }

  const result: {
    model: string;
    messages: readonly Readonly<OllamaChatMessage>[];
    tools?: readonly Readonly<OllamaTool>[];
    options?: Readonly<OllamaChatOptions>;
  } = {
    model: request.model as string,
    messages: Object.freeze(messages),
  };
  if (tools !== undefined) result.tools = tools;
  if (options !== undefined) result.options = options;
  return Object.freeze(result);
}

function snapshotRequestMessage(
  value: unknown,
  path: string,
  details: string[],
): Readonly<OllamaChatMessage> | undefined {
  if (!isRecord(value)) {
    details.push(`${path}: must be an object`);
    return undefined;
  }
  rejectUnknownProperties(value, MESSAGE_PROPERTIES, path, details);
  if (typeof value.role !== "string" || !CHAT_ROLES.has(value.role)) {
    details.push(`${path}.role: unsupported role`);
    return undefined;
  }

  const hasToolCalls = Object.hasOwn(value, "toolCalls");
  if (value.role !== "assistant" && hasToolCalls) {
    details.push(`${path}.toolCalls: is only allowed for assistant messages`);
  }
  if (value.role === "assistant" && hasToolCalls) {
    if (typeof value.content !== "string") {
      details.push(`${path}.content: must be a string`);
    }
    const toolCalls = snapshotToolCalls(
      value.toolCalls,
      `${path}.toolCalls`,
      details,
    );
    if (typeof value.content !== "string" || toolCalls === undefined) {
      return undefined;
    }
    return Object.freeze({
      role: "assistant",
      content: value.content,
      toolCalls,
    });
  }

  if (!isNonEmptyString(value.content)) {
    details.push(`${path}.content: must be a non-empty string`);
    return undefined;
  }
  if (value.role === "system") {
    return Object.freeze({ role: "system", content: value.content });
  }
  if (value.role === "user") {
    return Object.freeze({ role: "user", content: value.content });
  }
  if (value.role === "tool") {
    return Object.freeze({ role: "tool", content: value.content });
  }
  return Object.freeze({ role: "assistant", content: value.content });
}

function snapshotTool(
  value: unknown,
  path: string,
  details: string[],
): Readonly<OllamaTool> | undefined {
  if (!isRecord(value)) {
    details.push(`${path}: must be an object`);
    return undefined;
  }
  rejectUnknownProperties(value, new Set(["type", "function"]), path, details);
  if (value.type !== "function") {
    details.push(`${path}.type: must be \"function\"`);
  }
  if (!isRecord(value.function)) {
    details.push(`${path}.function: must be an object`);
    return undefined;
  }
  rejectUnknownProperties(
    value.function,
    new Set(["name", "description", "parameters"]),
    `${path}.function`,
    details,
  );
  if (!isNonEmptyString(value.function.name)) {
    details.push(`${path}.function.name: must be a non-empty string`);
  }
  if (
    value.function.description !== undefined &&
    typeof value.function.description !== "string"
  ) {
    details.push(`${path}.function.description: must be a string`);
  }
  const parameters = snapshotJsonObject(
    value.function.parameters,
    `${path}.function.parameters`,
    details,
  );
  if (
    value.type !== "function" ||
    !isNonEmptyString(value.function.name) ||
    (value.function.description !== undefined &&
      typeof value.function.description !== "string") ||
    parameters === undefined
  ) {
    return undefined;
  }
  const fn: {
    name: string;
    description?: string;
    parameters: Readonly<OllamaJsonObject>;
  } = { name: value.function.name, parameters };
  if (typeof value.function.description === "string") {
    fn.description = value.function.description;
  }
  return Object.freeze({ type: "function", function: Object.freeze(fn) });
}

function snapshotToolCalls(
  value: unknown,
  path: string,
  details: string[],
): readonly Readonly<OllamaToolCall>[] | undefined {
  if (!Array.isArray(value)) {
    details.push(`${path}: must be an array`);
    return undefined;
  }
  if (value.length === 0) {
    details.push(`${path}: must be a non-empty array`);
    return undefined;
  }
  if (hasSparseSlots(value)) {
    details.push(`${path}: must not be sparse`);
    return undefined;
  }
  const calls: Readonly<OllamaToolCall>[] = [];
  value.forEach((call, index) => {
    const snapshot = snapshotToolCall(call, `${path}[${index}]`, details);
    if (snapshot !== undefined) calls.push(snapshot);
  });
  return calls.length === value.length ? Object.freeze(calls) : undefined;
}

function snapshotToolCall(
  value: unknown,
  path: string,
  details: string[],
): Readonly<OllamaToolCall> | undefined {
  if (!isRecord(value)) {
    details.push(`${path}: must be an object`);
    return undefined;
  }
  rejectUnknownProperties(value, new Set(["function"]), path, details);
  if (!isRecord(value.function)) {
    details.push(`${path}.function: must be an object`);
    return undefined;
  }
  rejectUnknownProperties(
    value.function,
    new Set(["name", "arguments"]),
    `${path}.function`,
    details,
  );
  if (!isNonEmptyString(value.function.name)) {
    details.push(`${path}.function.name: must be a non-empty string`);
  }
  const args = snapshotJsonObject(
    value.function.arguments,
    `${path}.function.arguments`,
    details,
  );
  if (!isNonEmptyString(value.function.name) || args === undefined) {
    return undefined;
  }
  return Object.freeze({
    function: Object.freeze({ name: value.function.name, arguments: args }),
  });
}

function validateChatOptions(value: unknown, details: string[]): void {
  if (!isRecord(value)) {
    details.push("options: must be an object");
    return;
  }

  if (
    value.temperature !== undefined &&
    (!isFiniteNumber(value.temperature) ||
      value.temperature < 0 ||
      value.temperature > 2)
  ) {
    details.push("options.temperature: must be between 0 and 2");
  }
  if (
    value.top_p !== undefined &&
    (!isFiniteNumber(value.top_p) || value.top_p <= 0 || value.top_p > 1)
  ) {
    details.push("options.top_p: must be greater than 0 and at most 1");
  }
  if (
    value.num_predict !== undefined &&
    (!isFiniteNumber(value.num_predict) ||
      !Number.isInteger(value.num_predict) ||
      value.num_predict <= 0)
  ) {
    details.push("options.num_predict: must be a positive finite integer");
  }
  if (value.stop !== undefined) {
    if (
      !Array.isArray(value.stop) ||
      value.stop.length === 0 ||
      value.stop.length > 16 ||
      hasSparseSlots(value.stop)
    ) {
      details.push("options.stop: must contain between 1 and 16 values");
    } else {
      value.stop.forEach((stop, index) => {
        if (!isNonEmptyString(stop)) {
          details.push(`options.stop[${index}]: must be a non-empty string`);
        }
      });
    }
  }
}

function createChatBody(
  request: OllamaChatRequest,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages.map((message) => {
      const result: Record<string, unknown> = {
        role: message.role,
        content: message.content,
      };
      if ("toolCalls" in message) {
        result.tool_calls = message.toolCalls.map((call) => ({
          function: {
            name: call.function.name,
            arguments: copyJsonObject(call.function.arguments),
          },
        }));
      }
      return result;
    }),
    stream,
  };

  if (request.tools !== undefined) {
    body.tools = request.tools.map((tool) => {
      const fn: Record<string, unknown> = {
        name: tool.function.name,
        parameters: copyJsonObject(tool.function.parameters),
      };
      if (tool.function.description !== undefined) {
        fn.description = tool.function.description;
      }
      return { type: "function", function: fn };
    });
  }

  if (request.options !== undefined) {
    const options: Record<string, unknown> = {};
    if (request.options.temperature !== undefined) {
      options.temperature = request.options.temperature;
    }
    if (request.options.top_p !== undefined) {
      options.top_p = request.options.top_p;
    }
    if (request.options.num_predict !== undefined) {
      options.num_predict = request.options.num_predict;
    }
    if (request.options.stop !== undefined) {
      options.stop = [...request.options.stop];
    }
    body.options = options;
  }

  return body;
}

function parseModel(
  value: unknown,
  endpoint: string,
  index: number,
): OllamaModel {
  if (!isRecord(value)) {
    throw new OllamaResponseError(endpoint, [
      `models[${index}]: must be an object`,
    ]);
  }

  const details: string[] = [];
  if (!isNonEmptyString(value.name)) {
    details.push(`models[${index}].name: must be a non-empty string`);
  }
  if (!isNonEmptyString(value.model)) {
    details.push(`models[${index}].model: must be a non-empty string`);
  }
  validateOptionalString(
    value.modified_at,
    `models[${index}].modified_at`,
    details,
  );
  validateOptionalString(value.digest, `models[${index}].digest`, details);
  if (
    value.size !== undefined &&
    (!isFiniteNumber(value.size) ||
      !Number.isInteger(value.size) ||
      value.size < 0)
  ) {
    details.push(
      `models[${index}].size: must be a non-negative finite integer`,
    );
  }

  let modelDetails: Readonly<OllamaModelDetails> | undefined;
  if (value.details !== undefined) {
    modelDetails = parseModelDetails(value.details, index, details);
  }
  if (details.length > 0) {
    throw new OllamaResponseError(endpoint, details);
  }

  const result: {
    name: string;
    model: string;
    modifiedAt?: string;
    size?: number;
    digest?: string;
    details?: Readonly<OllamaModelDetails>;
  } = { name: value.name as string, model: value.model as string };
  if (typeof value.modified_at === "string")
    result.modifiedAt = value.modified_at;
  if (typeof value.size === "number") result.size = value.size;
  if (typeof value.digest === "string") result.digest = value.digest;
  if (modelDetails !== undefined) result.details = modelDetails;
  return Object.freeze(result);
}

function parseModelDetails(
  value: unknown,
  modelIndex: number,
  validationDetails: string[],
): Readonly<OllamaModelDetails> | undefined {
  const path = `models[${modelIndex}].details`;
  if (!isRecord(value)) {
    validationDetails.push(`${path}: must be an object`);
    return undefined;
  }

  validateOptionalString(value.format, `${path}.format`, validationDetails);
  validateOptionalString(value.family, `${path}.family`, validationDetails);
  validateOptionalString(
    value.parameter_size,
    `${path}.parameter_size`,
    validationDetails,
  );
  validateOptionalString(
    value.quantization_level,
    `${path}.quantization_level`,
    validationDetails,
  );
  if (
    value.families !== undefined &&
    (!Array.isArray(value.families) ||
      value.families.some((family) => typeof family !== "string"))
  ) {
    validationDetails.push(`${path}.families: must be an array of strings`);
  }

  if (validationDetails.length > 0) return undefined;

  const result: {
    format?: string;
    family?: string;
    families?: readonly string[];
    parameterSize?: string;
    quantizationLevel?: string;
  } = {};
  if (typeof value.format === "string") result.format = value.format;
  if (typeof value.family === "string") result.family = value.family;
  if (Array.isArray(value.families)) {
    result.families = Object.freeze([...value.families]) as readonly string[];
  }
  if (typeof value.parameter_size === "string") {
    result.parameterSize = value.parameter_size;
  }
  if (typeof value.quantization_level === "string") {
    result.quantizationLevel = value.quantization_level;
  }
  return Object.freeze(result);
}

function parseChatResponse(
  value: unknown,
  endpoint: string,
): OllamaChatResponse {
  if (!isRecord(value)) {
    throw new OllamaResponseError(endpoint, ["response: must be an object"]);
  }

  const details: string[] = [];
  if (!isNonEmptyString(value.model)) {
    details.push("model: must be a non-empty string");
  }
  const message = parseAssistantMessage(value.message, "message", details);
  if (typeof value.done !== "boolean") {
    details.push("done: must be a boolean");
  }
  validateOptionalString(value.done_reason, "done_reason", details);
  validateOptionalCount(value.prompt_eval_count, "prompt_eval_count", details);
  validateOptionalCount(value.eval_count, "eval_count", details);
  if (details.length > 0) {
    throw new OllamaResponseError(endpoint, details);
  }

  const result: {
    model: string;
    message: Readonly<OllamaAssistantMessage>;
    done: boolean;
    doneReason?: string;
    promptEvalCount?: number;
    evalCount?: number;
  } = {
    model: value.model as string,
    message: message as Readonly<OllamaAssistantMessage>,
    done: value.done as boolean,
  };
  if (typeof value.done_reason === "string")
    result.doneReason = value.done_reason;
  if (typeof value.prompt_eval_count === "number") {
    result.promptEvalCount = value.prompt_eval_count;
  }
  if (typeof value.eval_count === "number") result.evalCount = value.eval_count;
  return Object.freeze(result);
}

function parseChatStreamChunk(
  value: unknown,
  endpoint: string,
  index: number,
): OllamaChatStreamChunk {
  if (!isRecord(value)) {
    throw new OllamaResponseError(endpoint, [
      `stream[${index}]: must be an object`,
    ]);
  }

  const path = `stream[${index}]`;
  const details: string[] = [];
  let parsedMessage: Readonly<OllamaAssistantMessage> | undefined;
  if (value.model !== undefined && !isNonEmptyString(value.model)) {
    details.push(`${path}.model: must be a non-empty string`);
  }
  if (value.message !== undefined) {
    parsedMessage = parseAssistantMessage(
      value.message,
      `${path}.message`,
      details,
    );
  }
  if (typeof value.done !== "boolean") {
    details.push(`${path}.done: must be a boolean`);
  }
  validateOptionalString(value.done_reason, `${path}.done_reason`, details);
  validateOptionalCount(
    value.prompt_eval_count,
    `${path}.prompt_eval_count`,
    details,
  );
  validateOptionalCount(value.eval_count, `${path}.eval_count`, details);
  if (details.length > 0) throw new OllamaResponseError(endpoint, details);

  const chunk: {
    model?: string;
    message?: Readonly<OllamaAssistantMessage>;
    done: boolean;
    doneReason?: string;
    promptEvalCount?: number;
    evalCount?: number;
  } = { done: value.done as boolean };
  if (typeof value.model === "string") chunk.model = value.model;
  if (parsedMessage !== undefined) chunk.message = parsedMessage;
  if (typeof value.done_reason === "string") {
    chunk.doneReason = value.done_reason;
  }
  if (typeof value.prompt_eval_count === "number") {
    chunk.promptEvalCount = value.prompt_eval_count;
  }
  if (typeof value.eval_count === "number") chunk.evalCount = value.eval_count;
  return Object.freeze(chunk);
}

function parseAssistantMessage(
  value: unknown,
  path: string,
  details: string[],
): Readonly<OllamaAssistantMessage> | undefined {
  if (!isRecord(value)) {
    details.push(`${path}: must be an object`);
    return undefined;
  }
  rejectUnknownProperties(value, RESPONSE_MESSAGE_PROPERTIES, path, details);
  if (value.role !== "assistant") {
    details.push(`${path}.role: must be \"assistant\"`);
  }
  if (typeof value.content !== "string") {
    details.push(`${path}.content: must be a string`);
  }

  let toolCalls: readonly Readonly<OllamaToolCall>[] | undefined;
  if (value.tool_calls !== undefined) {
    toolCalls = snapshotToolCalls(
      value.tool_calls,
      `${path}.tool_calls`,
      details,
    );
  }
  if (
    value.role !== "assistant" ||
    typeof value.content !== "string" ||
    (value.tool_calls !== undefined && toolCalls === undefined)
  ) {
    return undefined;
  }
  if (toolCalls !== undefined) {
    return Object.freeze({
      role: "assistant",
      content: value.content,
      toolCalls,
    });
  }
  return Object.freeze({ role: "assistant", content: value.content });
}

async function readHttpErrorMessage(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) && typeof body.error === "string"
      ? body.error
      : undefined;
  } catch {
    return undefined;
  }
}

function validateOptionalString(
  value: unknown,
  path: string,
  details: string[],
): void {
  if (value !== undefined && typeof value !== "string") {
    details.push(`${path}: must be a string`);
  }
}

function validateOptionalCount(
  value: unknown,
  path: string,
  details: string[],
): void {
  if (
    value !== undefined &&
    (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0)
  ) {
    details.push(`${path}: must be a non-negative finite integer`);
  }
}

function snapshotJsonObject(
  value: unknown,
  path: string,
  details: string[],
): Readonly<OllamaJsonObject> | undefined {
  if (!isPlainRecord(value)) {
    details.push(`${path}: must be a JSON object`);
    return undefined;
  }
  return snapshotJsonRecord(value, path, details, new WeakSet());
}

function snapshotJsonRecord(
  value: Record<string, unknown>,
  path: string,
  details: string[],
  active: WeakSet<object>,
): Readonly<OllamaJsonObject> | undefined {
  if (active.has(value)) {
    details.push(`${path}: must not contain cyclic values`);
    return undefined;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    details.push(`${path}: must contain only string keys`);
    return undefined;
  }
  active.add(value);
  const result: Record<string, OllamaJsonValue> = {};
  let valid = true;
  for (const [key, child] of Object.entries(value)) {
    const snapshot = snapshotJsonValue(
      child,
      `${path}.${key}`,
      details,
      active,
    );
    if (snapshot === undefined && child !== null) {
      valid = false;
    } else {
      result[key] = snapshot as OllamaJsonValue;
    }
  }
  active.delete(value);
  return valid ? Object.freeze(result) : undefined;
}

function snapshotJsonValue(
  value: unknown,
  path: string,
  details: string[],
  active: WeakSet<object>,
): OllamaJsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    details.push(`${path}: must be a finite number`);
    return undefined;
  }
  if (Array.isArray(value)) {
    if (active.has(value)) {
      details.push(`${path}: must not contain cyclic values`);
      return undefined;
    }
    if (hasSparseSlots(value)) {
      details.push(`${path}: must not be sparse`);
      return undefined;
    }
    active.add(value);
    const result: OllamaJsonValue[] = [];
    let valid = true;
    value.forEach((child, index) => {
      const snapshot = snapshotJsonValue(
        child,
        `${path}[${index}]`,
        details,
        active,
      );
      if (snapshot === undefined && child !== null) valid = false;
      else result.push(snapshot as OllamaJsonValue);
    });
    active.delete(value);
    return valid ? Object.freeze(result) : undefined;
  }
  if (isPlainRecord(value)) {
    return snapshotJsonRecord(value, path, details, active);
  }
  details.push(`${path}: must be a JSON value`);
  return undefined;
}

function copyJsonObject(
  value: Readonly<OllamaJsonObject>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, copyJsonValue(child)]),
  );
}

function copyJsonValue(value: OllamaJsonValue): unknown {
  if (Array.isArray(value)) return value.map((child) => copyJsonValue(child));
  if (isPlainRecord(value)) return copyJsonObject(value);
  return value;
}

function rejectUnknownProperties(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  details: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) details.push(`${path}.${key}: unknown property`);
  }
}

function hasSparseSlots(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return true;
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason;
}

function causeOptions(cause: unknown): ErrorOptions | undefined {
  return cause === undefined ? undefined : { cause };
}
