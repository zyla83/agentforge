import {
  LLMFinishReason,
  LLMMessageRole,
  createLLMGenerationResponse,
  createToolExecutionContext,
  getLLMProviderCapabilities,
  isLLMStreamingProvider,
  validateLLMGenerationRequest,
} from "@agentforge/provider-sdk";
import type {
  JsonValue,
  LLMGenerationOptions,
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMMessage,
  LLMProvider,
  ProviderRequestOptions,
  ToolCall,
  ToolDefinition,
  ToolRegistry,
} from "@agentforge/provider-sdk";
import {
  type AgentProfile,
  createAgentProfile,
} from "../agent-profile/index.js";
import {
  appendConversationMessage,
  conversationToLLMMessages,
} from "../conversation/index.js";
import type {
  Conversation,
  ConversationFactoryOptions,
} from "../conversation/index.js";
import { validateConversation } from "../conversation/internal/validateConversation.js";
import {
  ToolExecutionAbortedError,
  ToolExecutionPhase,
  ToolExecutorImpl,
  serializeToolResultContent,
} from "../tools/index.js";
import type { ToolExecutionRecord } from "../tools/index.js";
import type { ConversationEngineOptions } from "./ConversationEngineOptions.js";
import type { ConversationProviderResolver } from "./ConversationProviderResolver.js";
import type { ConversationStreamEvent } from "./ConversationStreamEvent.js";
import type { ConversationTurnInput } from "./ConversationTurnInput.js";
import type { ConversationTurnResult } from "./ConversationTurnResult.js";
import {
  ConversationEngineError,
  ConversationProviderNotFoundError,
  ConversationProviderStreamingUnsupportedError,
  ConversationProviderToolsUnsupportedError,
  ConversationToolProtocolError,
  ConversationToolRoundLimitError,
  ConversationTurnAbortedError,
  ConversationTurnExecutionError,
  ConversationTurnExecutionPhase,
  InvalidConversationTurnError,
} from "./errors/index.js";
import {
  composeAbortSignals,
  throwIfConversationTurnAborted,
  validateConversationTurnInput,
} from "./internal/index.js";

const DEFAULT_MAX_TOOL_ROUNDS = 8;

interface ResolvedEngineOptions {
  readonly providers: ConversationProviderResolver;
  readonly conversationFactory?: Readonly<ConversationFactoryOptions>;
  readonly profile?: Readonly<AgentProfile>;
  readonly signal?: AbortSignal;
  readonly tools?: ToolRegistry;
  readonly toolExecutionEnabled: boolean;
  readonly maxToolRounds: number;
  readonly toolMetadata: Readonly<Record<string, JsonValue>>;
}

interface ResolvedConversationTurn {
  readonly profile: Readonly<AgentProfile> | undefined;
  readonly model: string;
  readonly provider: string | undefined;
  readonly generation: Readonly<LLMGenerationOptions> | undefined;
}

export class ConversationEngine {
  private readonly providers: ConversationProviderResolver;
  private readonly conversationFactory:
    | Readonly<ConversationFactoryOptions>
    | undefined;
  private readonly profile: Readonly<AgentProfile> | undefined;
  private readonly signal: AbortSignal | undefined;
  private readonly tools: ToolRegistry | undefined;
  private readonly toolExecutionEnabled: boolean;
  private readonly maxToolRounds: number;
  private readonly toolMetadata: Readonly<Record<string, JsonValue>>;

  constructor(options: ConversationEngineOptions) {
    const resolved = validateEngineOptions(options);
    this.providers = resolved.providers;
    this.conversationFactory = resolved.conversationFactory;
    this.profile = resolved.profile;
    this.signal = resolved.signal;
    this.tools = resolved.tools;
    this.toolExecutionEnabled = resolved.toolExecutionEnabled;
    this.maxToolRounds = resolved.maxToolRounds;
    this.toolMetadata = resolved.toolMetadata;
  }

  async runTurn(
    input: ConversationTurnInput,
  ): Promise<Readonly<ConversationTurnResult>> {
    const composed = composeAbortSignals([this.signal, getTurnSignal(input)]);
    try {
      const prepared = this.prepareTurn(input, composed.signal);
      let conversation = prepared.withUser;
      const records: Readonly<ToolExecutionRecord>[] = [];
      const callIds = new Set<string>();
      const executor =
        prepared.definitions === undefined
          ? undefined
          : new ToolExecutorImpl(this.tools as ToolRegistry);

      for (let round = 1; round <= this.maxToolRounds; round += 1) {
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.ProviderExecution,
        );
        const rawResponse = await prepared.provider.generate(
          createProviderRequest(
            conversation,
            prepared.resolved,
            prepared.request,
            prepared.definitions,
          ),
        );
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.ProviderExecution,
        );
        const response = snapshotProviderResponse(
          rawResponse,
          prepared.providerName,
        );
        if ("toolCalls" in response.message) {
          if (executor === undefined)
            throw new ConversationToolProtocolError(
              prepared.providerName,
              "returned tool calls when tools are disabled",
            );
          validateTurnCallIds(
            response.message.toolCalls,
            callIds,
            prepared.providerName,
          );
          conversation = appendConversationMessage(
            conversation,
            {
              role: LLMMessageRole.Assistant,
              content: response.message.content,
              toolCalls: response.message.toolCalls,
            },
            this.conversationFactory,
          );
          for (const call of response.message.toolCalls) {
            const record = await this.executeTool(
              executor,
              call,
              composed.signal,
            );
            records.push(record);
            throwIfConversationTurnAborted(
              composed.signal,
              ConversationTurnExecutionPhase.ToolResultAppend,
            );
            conversation = appendToolResult(
              conversation,
              record,
              this.conversationFactory,
            );
          }
          if (round === this.maxToolRounds)
            throw new ConversationToolRoundLimitError(this.maxToolRounds);
          throwIfConversationTurnAborted(
            composed.signal,
            ConversationTurnExecutionPhase.ToolLoop,
          );
          continue;
        }

        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.AssistantAppend,
        );
        const completedConversation = appendConversationMessage(
          conversation,
          { role: LLMMessageRole.Assistant, content: response.message.content },
          this.conversationFactory,
        );
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.AssistantAppend,
        );
        const assistantMessage = getLastMessage(
          completedConversation,
          ConversationTurnExecutionPhase.AssistantAppend,
        );
        const result = Object.freeze({
          conversation: completedConversation,
          userMessage: prepared.userMessage,
          assistantMessage,
          response,
          provider: prepared.providerName,
          model: prepared.resolved.model,
          profile: prepared.resolved.profile?.id,
          toolExecutions: Object.freeze([...records]),
          providerRounds: round,
        });
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.Completed,
        );
        return result;
      }
      throw new ConversationToolRoundLimitError(this.maxToolRounds);
    } finally {
      composed.dispose();
    }
  }

  async *streamTurn(
    input: ConversationTurnInput,
  ): AsyncIterable<ConversationStreamEvent> {
    const composed = composeAbortSignals([this.signal, getTurnSignal(input)]);
    try {
      const prepared = this.prepareTurn(input, composed.signal);
      if (!isLLMStreamingProvider(prepared.provider))
        throw new ConversationProviderStreamingUnsupportedError(
          prepared.providerName,
        );
      let conversation = prepared.withUser;
      const records: Readonly<ToolExecutionRecord>[] = [];
      const callIds = new Set<string>();
      const executor =
        prepared.definitions === undefined
          ? undefined
          : new ToolExecutorImpl(this.tools as ToolRegistry);
      yield Object.freeze({
        type: "started",
        conversation,
        userMessage: prepared.userMessage,
        provider: prepared.providerName,
        model: prepared.resolved.model,
        profile: prepared.resolved.profile?.id,
      });

      for (let round = 1; round <= this.maxToolRounds; round += 1) {
        const response = yield* streamProviderRound(
          prepared.provider,
          createProviderRequest(
            conversation,
            prepared.resolved,
            prepared.request,
            prepared.definitions,
          ),
          prepared.providerName,
          prepared.resolved,
          composed.signal,
        );
        if ("toolCalls" in response.message) {
          if (executor === undefined)
            throw new ConversationToolProtocolError(
              prepared.providerName,
              "returned tool calls when tools are disabled",
            );
          validateTurnCallIds(
            response.message.toolCalls,
            callIds,
            prepared.providerName,
          );
          conversation = appendConversationMessage(
            conversation,
            {
              role: LLMMessageRole.Assistant,
              content: response.message.content,
              toolCalls: response.message.toolCalls,
            },
            this.conversationFactory,
          );
          for (const call of response.message.toolCalls) {
            throwIfConversationTurnAborted(
              composed.signal,
              ConversationTurnExecutionPhase.ToolExecution,
            );
            yield Object.freeze({ type: "tool-call-started", call, round });
            const record = await this.executeTool(
              executor,
              call,
              composed.signal,
            );
            records.push(record);
            conversation = appendToolResult(
              conversation,
              record,
              this.conversationFactory,
            );
            yield Object.freeze({
              type: "tool-call-completed",
              call,
              result: record.result,
              round,
            });
          }
          if (round === this.maxToolRounds)
            throw new ConversationToolRoundLimitError(this.maxToolRounds);
          throwIfConversationTurnAborted(
            composed.signal,
            ConversationTurnExecutionPhase.ToolLoop,
          );
          continue;
        }
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.AssistantAppend,
        );
        const completedConversation = appendConversationMessage(
          conversation,
          { role: LLMMessageRole.Assistant, content: response.message.content },
          this.conversationFactory,
        );
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.AssistantAppend,
        );
        const assistantMessage = getLastMessage(
          completedConversation,
          ConversationTurnExecutionPhase.AssistantAppend,
        );
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.Completed,
        );
        yield Object.freeze({
          type: "completed",
          conversation: completedConversation,
          userMessage: prepared.userMessage,
          assistantMessage,
          response,
          provider: prepared.providerName,
          model: prepared.resolved.model,
          profile: prepared.resolved.profile?.id,
          toolExecutions: Object.freeze([...records]),
          providerRounds: round,
        });
        throwIfConversationTurnAborted(
          composed.signal,
          ConversationTurnExecutionPhase.Completed,
        );
        return;
      }
      throw new ConversationToolRoundLimitError(this.maxToolRounds);
    } finally {
      composed.dispose();
    }
  }

  private prepareTurn(
    input: ConversationTurnInput,
    signal: AbortSignal | undefined,
  ) {
    throwIfConversationTurnAborted(
      signal,
      ConversationTurnExecutionPhase.Validation,
    );
    validateConversationTurnInput(input);
    validateConversation(input.conversation);
    const resolved = this.resolveTurn(input);
    const provider = this.resolveProvider(resolved.provider);
    const providerName = provider.metadata.name;
    throwIfConversationTurnAborted(
      signal,
      ConversationTurnExecutionPhase.ProviderResolution,
    );
    const definitions = this.resolveToolDefinitions(input.tools);
    if (
      definitions !== undefined &&
      !getLLMProviderCapabilities(provider).tools
    ) {
      throw new ConversationProviderToolsUnsupportedError(providerName);
    }
    throwIfConversationTurnAborted(
      signal,
      ConversationTurnExecutionPhase.UserAppend,
    );
    const withUser = appendConversationMessage(
      input.conversation,
      { role: LLMMessageRole.User, content: input.content },
      this.conversationFactory,
    );
    throwIfConversationTurnAborted(
      signal,
      ConversationTurnExecutionPhase.UserAppend,
    );
    return {
      resolved,
      provider,
      providerName,
      definitions,
      withUser,
      userMessage: getLastMessage(
        withUser,
        ConversationTurnExecutionPhase.UserAppend,
      ),
      request: createEffectiveRequest(input.request, signal),
    };
  }

  private resolveToolDefinitions(
    selection: ConversationTurnInput["tools"],
  ): readonly Readonly<ToolDefinition>[] | undefined {
    const enabled =
      selection === undefined ? this.toolExecutionEnabled : selection !== false;
    if (!enabled || this.tools === undefined) return undefined;
    const all = this.tools.listDefinitions();
    if (Array.isArray(selection)) {
      const selected = new Set(selection);
      const unknown = selection.filter((name) => !this.tools?.has(name));
      if (unknown.length > 0)
        throw new InvalidConversationTurnError(
          unknown.map((name) => `tools: tool "${name}" is not registered`),
        );
      const subset = all.filter(({ name }) => selected.has(name));
      return subset.length === 0 ? undefined : Object.freeze(subset);
    }
    return all.length === 0 ? undefined : all;
  }

  private async executeTool(
    executor: ToolExecutorImpl,
    call: Readonly<ToolCall>,
    signal: AbortSignal | undefined,
  ): Promise<Readonly<ToolExecutionRecord>> {
    try {
      const result = await executor.execute(call, {
        ...(signal === undefined ? {} : { signal }),
        metadata: this.toolMetadata,
      });
      return Object.freeze({ call, result });
    } catch (error) {
      if (error instanceof ToolExecutionAbortedError) {
        throw new ConversationTurnAbortedError(
          mapToolExecutionPhase(error.phase),
          { reason: error.reason, cause: error },
        );
      }
      throw error;
    }
  }

  private resolveTurn(input: ConversationTurnInput): ResolvedConversationTurn {
    const profile =
      input.profile === undefined
        ? this.profile
        : createAgentProfile(input.profile);
    const model = input.model ?? profile?.model;
    if (model === undefined)
      throw new InvalidConversationTurnError([
        "model: is required when no profile model is available",
      ]);
    return Object.freeze({
      profile,
      model,
      provider: input.provider ?? profile?.provider,
      generation: mergeGeneration(profile?.generation, input.generation),
    });
  }

  private resolveProvider(name: string | undefined): LLMProvider {
    const provider =
      name === undefined
        ? this.providers.getDefaultLLMProvider()
        : this.providers.getLLMProvider(name);
    if (provider === undefined)
      throw new ConversationProviderNotFoundError(name);
    return provider;
  }
}

function mapToolExecutionPhase(
  phase: ToolExecutionPhase,
): ConversationTurnExecutionPhase {
  if (phase === ToolExecutionPhase.Resolution) {
    return ConversationTurnExecutionPhase.ToolResolution;
  }
  if (phase === ToolExecutionPhase.ArgumentValidation) {
    return ConversationTurnExecutionPhase.ToolArgumentValidation;
  }
  if (phase === ToolExecutionPhase.Result) {
    return ConversationTurnExecutionPhase.ToolResultAppend;
  }
  return ConversationTurnExecutionPhase.ToolExecution;
}

async function* streamProviderRound(
  provider: LLMProvider,
  request: LLMGenerationRequest,
  providerName: string,
  resolved: ResolvedConversationTurn,
  signal: AbortSignal | undefined,
): AsyncGenerator<ConversationStreamEvent, Readonly<LLMGenerationResponse>> {
  if (!isLLMStreamingProvider(provider))
    throw new ConversationProviderStreamingUnsupportedError(providerName);
  throwIfConversationTurnAborted(
    signal,
    ConversationTurnExecutionPhase.ProviderExecution,
  );
  let accumulatedContent = "";
  let deltaCount = 0;
  let completed: Readonly<LLMGenerationResponse> | undefined;
  for await (const event of provider.stream(request)) {
    throwIfConversationTurnAborted(
      signal,
      ConversationTurnExecutionPhase.ProviderExecution,
    );
    if (completed !== undefined)
      throw streamProtocolError(
        providerName,
        "received an event after completion",
      );
    if (!isRecord(event))
      throw streamProtocolError(providerName, "received an invalid event");
    if (event.type === "delta") {
      if (typeof event.delta !== "string" || typeof event.model !== "string")
        throw streamProtocolError(
          providerName,
          "received an invalid delta event",
        );
      if (event.delta.length === 0) continue;
      deltaCount += 1;
      accumulatedContent += event.delta;
      yield Object.freeze({
        type: "delta",
        delta: event.delta,
        content: accumulatedContent,
        provider: providerName,
        model: resolved.model,
        profile: resolved.profile?.id,
      });
      continue;
    }
    if (event.type === "completed") {
      completed = snapshotProviderResponse(event.response, providerName);
      continue;
    }
    throw streamProtocolError(providerName, "received an unknown event type");
  }
  throwIfConversationTurnAborted(
    signal,
    ConversationTurnExecutionPhase.ProviderExecution,
  );
  if (completed === undefined)
    throw streamProtocolError(providerName, "stream ended before completion");
  if ("toolCalls" in completed.message) {
    if (deltaCount > 0)
      throw new ConversationToolProtocolError(
        providerName,
        "emitted text deltas before completing with tool calls",
      );
  } else if (
    deltaCount > 0 &&
    completed.message.content !== accumulatedContent
  ) {
    throw streamProtocolError(
      providerName,
      "completed response content does not match streamed content",
    );
  }
  return completed;
}

function validateEngineOptions(
  options: ConversationEngineOptions,
): ResolvedEngineOptions {
  const value: unknown = options;
  if (!isRecord(value)) throw engineOptionsError("options must be an object");
  if (
    !isRecord(value.providers) ||
    typeof value.providers.getLLMProvider !== "function" ||
    typeof value.providers.getDefaultLLMProvider !== "function"
  ) {
    throw engineOptionsError(
      "providers must expose callable getLLMProvider and getDefaultLLMProvider methods",
    );
  }
  const conversationFactory = snapshotConversationFactory(
    value.conversationFactory,
  );
  const profile =
    value.profile === undefined
      ? undefined
      : createAgentProfile(value.profile as never);
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal))
    throw engineOptionsError("signal must be an AbortSignal");
  const tools = snapshotRegistry(value.tools);
  const execution = snapshotToolExecution(value.toolExecution);
  return {
    providers: value.providers as unknown as ConversationProviderResolver,
    ...(conversationFactory === undefined ? {} : { conversationFactory }),
    ...(profile === undefined ? {} : { profile }),
    ...(value.signal === undefined ? {} : { signal: value.signal }),
    ...(tools === undefined ? {} : { tools }),
    ...execution,
  };
}

function snapshotRegistry(value: unknown): ToolRegistry | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    ["has", "get", "require", "getDefinition", "list", "listDefinitions"].some(
      (method) => typeof value[method] !== "function",
    )
  ) {
    throw engineOptionsError(
      "tools must expose the read-only ToolRegistry methods",
    );
  }
  return value as unknown as ToolRegistry;
}

function snapshotToolExecution(
  value: unknown,
): Pick<
  ResolvedEngineOptions,
  "toolExecutionEnabled" | "maxToolRounds" | "toolMetadata"
> {
  if (value !== undefined && !isRecord(value))
    throw engineOptionsError("toolExecution must be an object");
  const options = (value ?? {}) as Record<string, unknown>;
  if (options.enabled !== undefined && typeof options.enabled !== "boolean")
    throw engineOptionsError("toolExecution.enabled must be a boolean");
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  if (
    typeof maxRounds !== "number" ||
    !Number.isInteger(maxRounds) ||
    maxRounds < 1 ||
    maxRounds > 32
  )
    throw engineOptionsError(
      "toolExecution.maxRounds must be an integer from 1 through 32",
    );
  let metadata: Readonly<Record<string, JsonValue>>;
  try {
    metadata = createToolExecutionContext({
      metadata: options.metadata as never,
    }).metadata;
  } catch (error) {
    throw engineOptionsError(
      "toolExecution.metadata must be a JSON object",
      error,
    );
  }
  return {
    toolExecutionEnabled: options.enabled === true,
    maxToolRounds: maxRounds,
    toolMetadata: metadata,
  };
}

function createProviderRequest(
  conversation: Conversation,
  resolved: ResolvedConversationTurn,
  effectiveRequest: Readonly<ProviderRequestOptions> | undefined,
  tools: readonly Readonly<ToolDefinition>[] | undefined,
): LLMGenerationRequest {
  const request: LLMGenerationRequest = {
    model: resolved.model,
    messages: createProviderMessages(conversation, resolved.profile),
    ...(resolved.generation === undefined
      ? {}
      : { generation: resolved.generation }),
    ...(effectiveRequest === undefined ? {} : { request: effectiveRequest }),
    ...(tools === undefined ? {} : { tools }),
  };
  validateLLMGenerationRequest(request);
  return Object.freeze(request);
}

function appendToolResult(
  conversation: Readonly<Conversation>,
  record: Readonly<ToolExecutionRecord>,
  options: ConversationFactoryOptions | undefined,
): Readonly<Conversation> {
  return appendConversationMessage(
    conversation,
    {
      role: LLMMessageRole.Tool,
      content: serializeToolResultContent(record.result),
      toolCallId: record.call.id,
      toolName: record.call.name,
      result: record.result,
    },
    options,
  );
}

function snapshotProviderResponse(
  response: LLMGenerationResponse,
  provider: string,
): Readonly<LLMGenerationResponse> {
  try {
    return createLLMGenerationResponse(response);
  } catch (error) {
    throw new ConversationToolProtocolError(
      provider,
      "returned an invalid generation response",
      { cause: error },
    );
  }
}

function validateTurnCallIds(
  calls: readonly Readonly<ToolCall>[],
  ids: Set<string>,
  provider: string,
): void {
  for (const call of calls) {
    if (ids.has(call.id))
      throw new ConversationToolProtocolError(
        provider,
        `reused tool call ID "${call.id}"`,
      );
    ids.add(call.id);
  }
}

function createEffectiveRequest(
  request: ProviderRequestOptions | undefined,
  signal: AbortSignal | undefined,
): Readonly<ProviderRequestOptions> | undefined {
  if (request === undefined && signal === undefined) return undefined;
  return Object.freeze({
    ...(request?.timeoutMs === undefined
      ? {}
      : { timeoutMs: request.timeoutMs }),
    ...(signal === undefined ? {} : { signal }),
  });
}

function createProviderMessages(
  conversation: Conversation,
  profile: Readonly<AgentProfile> | undefined,
): readonly Readonly<LLMMessage>[] {
  const messages = conversationToLLMMessages(conversation);
  if (profile === undefined) return messages;
  return Object.freeze([
    { role: LLMMessageRole.System, content: profile.systemPrompt },
    ...messages,
  ]);
}

function mergeGeneration(
  profile: Readonly<LLMGenerationOptions> | undefined,
  turn: LLMGenerationOptions | undefined,
): Readonly<LLMGenerationOptions> | undefined {
  if (profile === undefined && turn === undefined) return undefined;
  const merged = { ...profile, ...turn };
  return Object.freeze({
    ...(merged.temperature === undefined
      ? {}
      : { temperature: merged.temperature }),
    ...(merged.topP === undefined ? {} : { topP: merged.topP }),
    ...(merged.maxTokens === undefined ? {} : { maxTokens: merged.maxTokens }),
    ...(merged.stop === undefined
      ? {}
      : { stop: Object.freeze([...merged.stop]) }),
  });
}

function snapshotConversationFactory(
  value: unknown,
): Readonly<ConversationFactoryOptions> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value))
    throw engineOptionsError("conversationFactory must be an object");
  if (
    value.idGenerator !== undefined &&
    typeof value.idGenerator !== "function"
  )
    throw engineOptionsError(
      "conversationFactory.idGenerator must be a function",
    );
  if (value.now !== undefined && typeof value.now !== "function")
    throw engineOptionsError("conversationFactory.now must be a function");
  return Object.freeze({
    ...(typeof value.idGenerator === "function"
      ? { idGenerator: value.idGenerator as () => string }
      : {}),
    ...(typeof value.now === "function"
      ? { now: value.now as () => Date }
      : {}),
  });
}

function getLastMessage(
  conversation: Conversation,
  phase: ConversationTurnExecutionPhase,
) {
  const message = conversation.messages.at(-1);
  if (message === undefined)
    throw new ConversationTurnExecutionError(
      phase,
      "Conversation engine failed to append a message.",
    );
  return message;
}

function getTurnSignal(input: ConversationTurnInput): AbortSignal | undefined {
  const value: unknown = input;
  return isRecord(value) &&
    isRecord(value.request) &&
    value.request.signal instanceof AbortSignal
    ? value.request.signal
    : undefined;
}

function streamProtocolError(
  provider: string,
  detail: string,
): ConversationEngineError {
  return new ConversationEngineError(
    `LLM provider "${provider}" stream protocol is invalid: ${detail}.`,
  );
}

function engineOptionsError(
  detail: string,
  cause?: unknown,
): ConversationEngineError {
  return new ConversationEngineError(
    `Conversation engine options are invalid: ${detail}.`,
    cause === undefined ? undefined : { cause },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
