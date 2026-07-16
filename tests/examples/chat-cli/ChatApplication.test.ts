import process from "node:process";
import { PassThrough } from "node:stream";
import {
  AgentForge,
  appendConversationMessage,
  createAgentProfile,
  createConversation,
} from "@agentforge/core";
import type {
  ConversationEngine,
  ConversationTurnInput,
} from "@agentforge/core";
import { LLMFinishReason, LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";

function captureStream() {
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

function countOccurrences(value: string, expected: string): number {
  return value.split(expected).length - 1;
}

function createFakeEngine(inputs: ConversationTurnInput[]): ConversationEngine {
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

function requireLast<T>(values: readonly T[]): T {
  const value = values.at(-1);
  if (value === undefined) throw new Error("Expected a conversation message.");
  return value;
}

function createApplication(
  input: NodeJS.ReadableStream,
  engine: ConversationEngine,
  output: PassThrough,
  errorOutput: PassThrough,
) {
  const profile = createAgentProfile({
    id: "interactive-chat",
    systemPrompt: "Assist.",
    model: "model",
    provider: "ollama",
  });
  return new ChatApplication({
    agent: new AgentForge(),
    engine,
    profile,
    initialConversation: createConversation(),
    timeoutMs: 1_000,
    input,
    output,
    errorOutput,
  });
}

describe("ChatApplication", () => {
  it("streams two turns and carries completed history forward", async () => {
    const output = captureStream();
    const errors = captureStream();
    const inputs: ConversationTurnInput[] = [];
    const input = new PassThrough();
    const initialSigintListeners = process.listenerCount("SIGINT");
    const initialSigtermListeners = process.listenerCount("SIGTERM");
    const application = createApplication(
      input,
      createFakeEngine(inputs),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.write("  First question  \n");
    await output.waitFor("Assistant: Answer 1\nYou: ");
    input.write("Second question\n");
    await output.waitFor("Assistant: Answer 2\nYou: ");
    input.write("/info\n");
    await output.waitFor("Messages: 4\nYou: ");
    input.write("/exit\n");
    await running;

    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.content).toBe("  First question  ");
    expect(inputs[1]?.conversation.messages).toHaveLength(2);
    expect(inputs[0]?.request).toMatchObject({ timeoutMs: 1_000 });
    expect(inputs[0]?.request?.signal).toBeInstanceOf(AbortSignal);
    expect(output.read()).toContain("AgentForge Interactive Chat");
    expect(output.read()).toContain("Assistant: Answer 1");
    expect(output.read()).toContain("Assistant: Answer 2");
    expect(output.read()).toContain("Messages: 4");
    expect(errors.read()).toBe("");
    expect(process.listenerCount("SIGINT")).toBe(initialSigintListeners);
    expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListeners);
  });

  it("handles help, info, reset, blank input, and exit without a turn", async () => {
    const output = captureStream();
    const errors = captureStream();
    const inputs: ConversationTurnInput[] = [];
    const input = new PassThrough();
    const application = createApplication(
      input,
      createFakeEngine(inputs),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.write("\n");
    await output.waitFor("You: ", 2);
    input.write("/help\n");
    await output.waitFor("/exit   Exit the chat\nYou: ");
    input.write("/info\n");
    await output.waitFor("Messages: 0\nYou: ");
    input.write("/reset\n");
    await output.waitFor("Conversation reset.\nYou: ");
    input.write("/info\n");
    await output.waitFor("Messages: 0", 2);
    input.write("/quit\n");
    await running;

    expect(inputs).toHaveLength(0);
    expect(output.read()).toContain("/help   Show available commands");
    expect(output.read()).toContain("Conversation reset.");
    expect(output.read().match(/Messages: 0/g)).toHaveLength(2);
    expect(errors.read()).toBe("");
  });

  it("treats EOF as a normal exit", async () => {
    const output = captureStream();
    const errors = captureStream();
    const input = new PassThrough();
    const application = createApplication(
      input,
      createFakeEngine([]),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.push(null);
    await running;

    expect(errors.read()).toBe("");
  });
});
