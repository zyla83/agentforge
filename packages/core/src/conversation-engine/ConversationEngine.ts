import {
  LLMMessageRole,
  isLLMStreamingProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
} from "@agentforge/provider-sdk";
import {
  appendConversationMessage,
  conversationToLLMMessages,
} from "../conversation/index.js";
import type { ConversationFactoryOptions } from "../conversation/index.js";
import { validateConversation } from "../conversation/internal/validateConversation.js";
import type { ConversationEngineOptions } from "./ConversationEngineOptions.js";
import type { ConversationProviderResolver } from "./ConversationProviderResolver.js";
import type { ConversationStreamEvent } from "./ConversationStreamEvent.js";
import type { ConversationTurnInput } from "./ConversationTurnInput.js";
import type { ConversationTurnResult } from "./ConversationTurnResult.js";
import {
  ConversationEngineError,
  ConversationProviderNotFoundError,
  ConversationProviderStreamingUnsupportedError,
} from "./errors/index.js";
import { validateConversationTurnInput } from "./internal/index.js";

interface ResolvedEngineOptions {
  readonly providers: ConversationProviderResolver;
  readonly conversationFactory?: Readonly<ConversationFactoryOptions>;
}

export class ConversationEngine {
  private readonly providers: ConversationProviderResolver;
  private readonly conversationFactory:
    | Readonly<ConversationFactoryOptions>
    | undefined;

  constructor(options: ConversationEngineOptions) {
    const resolved = validateEngineOptions(options);
    this.providers = resolved.providers;
    this.conversationFactory = resolved.conversationFactory;
  }

  async runTurn(
    input: ConversationTurnInput,
  ): Promise<Readonly<ConversationTurnResult>> {
    validateConversationTurnInput(input);
    validateConversation(input.conversation);
    const provider = this.resolveProvider(input.provider);
    const providerName = provider.metadata.name;
    const withUser = appendConversationMessage(
      input.conversation,
      { role: LLMMessageRole.User, content: input.content },
      this.conversationFactory,
    );
    const userMessage = getLastMessage(withUser);
    const response = await provider.generate(
      createProviderRequest(input, withUser),
    );
    const completedConversation = appendConversationMessage(
      withUser,
      {
        role: LLMMessageRole.Assistant,
        content: response.message.content,
      },
      this.conversationFactory,
    );
    const assistantMessage = getLastMessage(completedConversation);

    return Object.freeze({
      conversation: completedConversation,
      userMessage,
      assistantMessage,
      response,
      provider: providerName,
    });
  }

  async *streamTurn(
    input: ConversationTurnInput,
  ): AsyncIterable<ConversationStreamEvent> {
    validateConversationTurnInput(input);
    validateConversation(input.conversation);
    const provider = this.resolveProvider(input.provider);
    const providerName = provider.metadata.name;
    if (!isLLMStreamingProvider(provider)) {
      throw new ConversationProviderStreamingUnsupportedError(providerName);
    }

    const withUser = appendConversationMessage(
      input.conversation,
      { role: LLMMessageRole.User, content: input.content },
      this.conversationFactory,
    );
    const userMessage = getLastMessage(withUser);
    yield Object.freeze({
      type: "started",
      conversation: withUser,
      userMessage,
      provider: providerName,
      model: input.model,
    });

    let accumulatedContent = "";
    let deltaCount = 0;
    let completedResponse: Readonly<LLMGenerationResponse> | undefined;
    for await (const event of provider.stream(
      createProviderRequest(input, withUser),
    )) {
      if (completedResponse !== undefined) {
        throw streamProtocolError(
          providerName,
          "received an event after completion",
        );
      }
      if (!isRecord(event)) {
        throw streamProtocolError(providerName, "received an invalid event");
      }
      if (event.type === "delta") {
        if (
          typeof event.delta !== "string" ||
          typeof event.model !== "string"
        ) {
          throw streamProtocolError(
            providerName,
            "received an invalid delta event",
          );
        }
        if (event.delta.length === 0) continue;
        deltaCount += 1;
        accumulatedContent += event.delta;
        yield Object.freeze({
          type: "delta",
          delta: event.delta,
          content: accumulatedContent,
          provider: providerName,
          model: event.model,
        });
        continue;
      }
      if (event.type === "completed") {
        if (!hasResponseContent(event.response)) {
          throw streamProtocolError(
            providerName,
            "received an invalid completed event",
          );
        }
        completedResponse = event.response;
        continue;
      }
      throw streamProtocolError(providerName, "received an unknown event type");
    }

    if (completedResponse === undefined) {
      throw streamProtocolError(providerName, "stream ended before completion");
    }
    if (
      deltaCount > 0 &&
      completedResponse.message.content !== accumulatedContent
    ) {
      throw streamProtocolError(
        providerName,
        "completed response content does not match streamed content",
      );
    }

    const completedConversation = appendConversationMessage(
      withUser,
      {
        role: LLMMessageRole.Assistant,
        content: completedResponse.message.content,
      },
      this.conversationFactory,
    );
    const assistantMessage = getLastMessage(completedConversation);
    yield Object.freeze({
      type: "completed",
      conversation: completedConversation,
      userMessage,
      assistantMessage,
      response: completedResponse,
      provider: providerName,
    });
  }

  private resolveProvider(name: string | undefined): LLMProvider {
    const provider =
      name === undefined
        ? this.providers.getDefaultLLMProvider()
        : this.providers.getLLMProvider(name);
    if (provider === undefined) {
      throw new ConversationProviderNotFoundError(name);
    }
    return provider;
  }
}

function validateEngineOptions(
  options: ConversationEngineOptions,
): ResolvedEngineOptions {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw engineOptionsError("options must be an object");
  }
  if (!isRecord(value.providers)) {
    throw engineOptionsError("providers must be an object");
  }
  if (
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
  return conversationFactory === undefined
    ? { providers: value.providers as unknown as ConversationProviderResolver }
    : {
        providers: value.providers as unknown as ConversationProviderResolver,
        conversationFactory,
      };
}

function snapshotConversationFactory(
  value: unknown,
): Readonly<ConversationFactoryOptions> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw engineOptionsError("conversationFactory must be an object");
  }
  const details: string[] = [];
  if (
    value.idGenerator !== undefined &&
    typeof value.idGenerator !== "function"
  ) {
    details.push("conversationFactory.idGenerator must be a function");
  }
  if (value.now !== undefined && typeof value.now !== "function") {
    details.push("conversationFactory.now must be a function");
  }
  if (details.length > 0) throw engineOptionsError(details.join("; "));
  const snapshot: ConversationFactoryOptions = {
    ...(typeof value.idGenerator === "function"
      ? { idGenerator: value.idGenerator as () => string }
      : {}),
    ...(typeof value.now === "function"
      ? { now: value.now as () => Date }
      : {}),
  };
  return Object.freeze(snapshot);
}

function createProviderRequest(
  input: ConversationTurnInput,
  conversation: Parameters<typeof conversationToLLMMessages>[0],
): LLMGenerationRequest {
  return {
    model: input.model,
    messages: conversationToLLMMessages(conversation),
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    ...(input.request === undefined ? {} : { request: input.request }),
  };
}

function getLastMessage(
  conversation: Parameters<typeof conversationToLLMMessages>[0],
) {
  const message = conversation.messages.at(-1);
  if (message === undefined) {
    throw new ConversationEngineError(
      "Conversation engine failed to append a message.",
    );
  }
  return message;
}

function hasResponseContent(value: unknown): value is LLMGenerationResponse {
  return (
    isRecord(value) &&
    isRecord(value.message) &&
    typeof value.message.content === "string"
  );
}

function streamProtocolError(
  provider: string,
  detail: string,
): ConversationEngineError {
  return new ConversationEngineError(
    `LLM provider "${provider}" stream protocol is invalid: ${detail}.`,
  );
}

function engineOptionsError(detail: string): ConversationEngineError {
  return new ConversationEngineError(
    `Conversation engine options are invalid: ${detail}.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
