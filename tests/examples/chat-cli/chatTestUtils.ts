import { PassThrough } from "node:stream";
import {
  AgentForge,
  appendConversationMessage,
  createAgentProfile,
} from "@agentforge/core";
import type {
  ConversationEngine,
  ConversationStore,
  ConversationStoreEntry,
  ConversationTurnInput,
} from "@agentforge/core";
import { LLMFinishReason, LLMMessageRole } from "@agentforge/provider-sdk";
import { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";
import type { ChatApplicationTtsOptions } from "../../../examples/chat-cli/src/ChatApplicationOptions.js";
import { createChatToolOptions } from "../../../examples/chat-cli/src/chatTools.js";

export function captureStream() {
  const stream = new PassThrough();
  let text = "";
  const waiters: Array<{
    readonly expected: string;
    readonly count: number;
    readonly resolve: () => void;
  }> = [];
  stream.on("data", (chunk: Buffer) => {
    text += chunk.toString();
    for (const waiter of [...waiters]) {
      if (countOccurrences(text, waiter.expected) < waiter.count) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  });
  return {
    stream,
    read: () => text,
    waitFor(expected: string, count = 1) {
      if (countOccurrences(text, expected) >= count) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push({ expected, count, resolve });
      });
    },
  };
}

export function createCompletedEngine(
  inputs: ConversationTurnInput[],
): ConversationEngine {
  return {
    async *streamTurn(input: ConversationTurnInput) {
      inputs.push(input);
      const withUser = appendConversationMessage(input.conversation, {
        role: LLMMessageRole.User,
        content: input.content,
      });
      const completed = appendConversationMessage(withUser, {
        role: LLMMessageRole.Assistant,
        content: `Answer ${inputs.length}`,
      });
      yield {
        type: "delta",
        delta: `Answer ${inputs.length}`,
        content: `Answer ${inputs.length}`,
        provider: "ollama",
        model: "model",
        profile: "interactive-chat",
      } as const;
      yield {
        type: "completed",
        conversation: completed,
        userMessage: requireLast(withUser.messages),
        assistantMessage: requireLast(completed.messages),
        response: {
          model: "model",
          message: {
            role: LLMMessageRole.Assistant,
            content: `Answer ${inputs.length}`,
          },
          finishReason: LLMFinishReason.Stop,
        },
        provider: "ollama",
        model: "model",
        profile: "interactive-chat",
      } as const;
    },
  } as unknown as ConversationEngine;
}

export function createTestApplication(options: {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly errorOutput: NodeJS.WritableStream;
  readonly engine: ConversationEngine;
  readonly store: ConversationStore;
  readonly initialEntry: Readonly<ConversationStoreEntry>;
  readonly dataDirectory?: string;
  readonly tts?: Readonly<ChatApplicationTtsOptions>;
}): ChatApplication {
  return new ChatApplication({
    agent: new AgentForge(),
    engine: options.engine,
    profile: createAgentProfile({
      id: "interactive-chat",
      systemPrompt: "Assist.",
      model: "model",
      provider: "ollama",
    }),
    store: options.store,
    initialEntry: options.initialEntry,
    dataDirectory: options.dataDirectory ?? "C:\\chat-data",
    timeoutMs: 1_000,
    input: options.input,
    output: options.output,
    errorOutput: options.errorOutput,
    tools: createChatToolOptions("off"),
    tts: options.tts ?? { mode: "off" },
  });
}

export function requireLast<T>(values: readonly T[]): T {
  const value = values.at(-1);
  if (value === undefined) throw new Error("Expected a conversation message.");
  return value;
}

function countOccurrences(value: string, expected: string): number {
  return value.split(expected).length - 1;
}
