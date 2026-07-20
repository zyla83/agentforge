import process from "node:process";
import type { Interface } from "node:readline/promises";
import { PassThrough } from "node:stream";
import {
  AgentForge,
  ConversationTurnAbortedError,
  appendConversationMessage,
  createAgentProfile,
  createConversation,
  createInMemoryConversationStore,
} from "@agentforge/core";
import type {
  ConversationEngine,
  ConversationTurnInput,
} from "@agentforge/core";
import { LLMFinishReason, LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";
import { createChatToolOptions } from "../../../examples/chat-cli/src/chatTools.js";

function captureStream(stream: PassThrough = new PassThrough()) {
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

class TestTerminalInput extends PassThrough {
  readonly isTTY = true;
  isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

class TestTerminalOutput extends PassThrough {
  readonly isTTY = true;
  readonly columns = 80;
  readonly rows = 24;
}

function countOccurrences(value: string, expected: string): number {
  return value.split(expected).length - 1;
}

function requireReadline(application: ChatApplication): Interface {
  const readline = (
    application as unknown as { readonly readline: Interface | undefined }
  ).readline;
  if (readline === undefined) throw new Error("Expected an active readline.");
  return readline;
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

function createCancellableThenCompletedEngine(
  inputs: ConversationTurnInput[],
  onAbort: () => void,
): ConversationEngine {
  return {
    async *streamTurn(input: ConversationTurnInput) {
      inputs.push(input);
      if (inputs.length === 1) {
        yield {
          type: "delta",
          delta: "partial",
          content: "partial",
          provider: "ollama",
          model: "model",
          profile: "interactive-chat",
        } as const;
        await observeAbort(input.request?.signal, onAbort);
        throw new ConversationTurnAbortedError("provider-execution", {
          reason: input.request?.signal?.reason,
        });
      }

      const withUser = appendConversationMessage(input.conversation, {
        role: LLMMessageRole.User,
        content: input.content,
      });
      const completed = appendConversationMessage(withUser, {
        role: LLMMessageRole.Assistant,
        content: "Conversation remains usable.",
      });
      yield {
        type: "delta",
        delta: "Conversation remains usable.",
        content: "Conversation remains usable.",
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
            content: "Conversation remains usable.",
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

async function observeAbort(
  signal: AbortSignal | undefined,
  onAbort: () => void,
): Promise<void> {
  if (signal?.aborted) {
    onAbort();
    return;
  }
  await new Promise<void>((resolve) => {
    signal?.addEventListener(
      "abort",
      () => {
        onAbort();
        resolve();
      },
      { once: true },
    );
  });
}

function createScriptedEngine(
  inputs: ConversationTurnInput[],
  deltas: readonly string[],
  completedContent: string,
): ConversationEngine {
  return {
    async *streamTurn(input: ConversationTurnInput) {
      inputs.push(input);
      const withUser = appendConversationMessage(input.conversation, {
        role: LLMMessageRole.User,
        content: input.content,
      });
      const completedWithValidatedMessage = appendConversationMessage(
        withUser,
        {
          role: LLMMessageRole.Assistant,
          content: completedContent || "placeholder",
        },
      );
      const assistantMessage = {
        ...requireLast(completedWithValidatedMessage.messages),
        content: completedContent,
      };
      const completed = {
        ...completedWithValidatedMessage,
        messages: [...withUser.messages, assistantMessage],
      };
      yield {
        type: "started",
        conversation: withUser,
        userMessage: requireLast(withUser.messages),
        provider: "ollama",
        model: "model",
        profile: "interactive-chat",
      } as const;
      let streamedContent = "";
      for (const delta of deltas) {
        streamedContent += delta;
        yield {
          type: "delta",
          delta,
          content: streamedContent,
          provider: "ollama",
          model: "model",
          profile: "interactive-chat",
        } as const;
      }
      yield {
        type: "completed",
        conversation: completed,
        userMessage: requireLast(withUser.messages),
        assistantMessage,
        response: {
          model: "model",
          message: {
            role: LLMMessageRole.Assistant,
            content: completedContent,
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
  return createApplicationHarness(input, engine, output, errorOutput)
    .application;
}

function createApplicationHarness(
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
  const initialConversation = createConversation();
  const initialEntry = {
    conversation: initialConversation,
    savedAt: initialConversation.createdAt,
    revision: 1,
  };
  const store = createInMemoryConversationStore({
    initialEntries: [initialEntry],
  });
  const application = new ChatApplication({
    agent: new AgentForge(),
    engine,
    profile,
    store,
    initialEntry,
    dataDirectory: "C:\\test-data",
    timeoutMs: 1_000,
    input,
    output,
    errorOutput,
    tools: createChatToolOptions("off"),
  });
  return { application, initialEntry, store };
}

describe("ChatApplication", () => {
  it("routes readline SIGINT to active-turn cancellation without duplicate handling", async () => {
    const input = new TestTerminalInput();
    const output = captureStream(new TestTerminalOutput());
    const errors = captureStream();
    const inputs: ConversationTurnInput[] = [];
    let abortEvents = 0;
    const initialInputEndListeners = input.listenerCount("end");
    const initialSigintListeners = new Set(process.listeners("SIGINT"));
    const initialSigtermListenerCount = process.listenerCount("SIGTERM");
    const { application, initialEntry, store } = createApplicationHarness(
      input,
      createCancellableThenCompletedEngine(inputs, () => {
        abortEvents += 1;
      }),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    const readline = requireReadline(application);
    const processSigintHandler = process
      .listeners("SIGINT")
      .find((listener) => !initialSigintListeners.has(listener));
    expect(processSigintHandler).toBeDefined();
    expect(readline.listeners("SIGINT")).toContain(processSigintHandler);

    input.write("Cancel me\r");
    await output.waitFor("Assistant: partial");
    input.write("\x03");
    processSigintHandler?.();
    await output.waitFor("Response cancelled.\n");
    await output.waitFor("You: ", 2);

    input.write("Continue\r");
    await output.waitFor("Assistant: Conversation remains usable.\n");
    await output.waitFor("You: ", 3);
    input.write("/exit\r");
    await running;

    const persisted = await store.require(initialEntry.conversation.id);
    expect(abortEvents).toBe(1);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]?.conversation.messages).toHaveLength(0);
    expect(
      countOccurrences(output.read(), "Cancelling current response..."),
    ).toBe(1);
    expect(countOccurrences(output.read(), "Response cancelled.")).toBe(1);
    expect(output.read()).not.toContain("late delta");
    expect(persisted.revision).toBe(2);
    expect(persisted.conversation.messages).toHaveLength(2);
    expect(persisted.conversation.messages[0]?.content).toBe("Continue");
    expect(errors.read()).toBe("");
    expect(input.listenerCount("end")).toBe(initialInputEndListeners);
    expect(readline.listenerCount("SIGINT")).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(initialSigintListeners.size);
    expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListenerCount);
  });

  it("uses readline SIGINT to exit an idle prompt and cleans up repeatedly", async () => {
    const initialSigintListenerCount = process.listenerCount("SIGINT");
    const initialSigtermListenerCount = process.listenerCount("SIGTERM");

    for (let run = 0; run < 2; run += 1) {
      const input = new TestTerminalInput();
      const output = captureStream(new TestTerminalOutput());
      const errors = captureStream();
      const initialInputEndListeners = input.listenerCount("end");
      const application = createApplication(
        input,
        createFakeEngine([]),
        output.stream,
        errors.stream,
      );

      const running = application.run();
      await output.waitFor("You: ");
      const readline = requireReadline(application);
      expect(readline.listenerCount("SIGINT")).toBe(1);
      input.write("\x03");
      await running;

      expect(output.read()).not.toContain("Cancelling current response...");
      expect(output.read()).not.toContain("Response cancelled.");
      expect(errors.read()).toBe("");
      expect(input.listenerCount("end")).toBe(initialInputEndListeners);
      expect(readline.listenerCount("SIGINT")).toBe(0);
      expect(process.listenerCount("SIGINT")).toBe(initialSigintListenerCount);
      expect(process.listenerCount("SIGTERM")).toBe(
        initialSigtermListenerCount,
      );
    }
  });

  it("preserves process-level SIGINT as an active-turn fallback", async () => {
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const inputs: ConversationTurnInput[] = [];
    const initialSigintListeners = new Set(process.listeners("SIGINT"));
    const application = createApplication(
      input,
      createCancellableThenCompletedEngine(inputs, () => undefined),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    const processSigintHandler = process
      .listeners("SIGINT")
      .find((listener) => !initialSigintListeners.has(listener));
    expect(processSigintHandler).toBeDefined();
    input.write("Cancel me\n");
    await output.waitFor("Assistant: partial");
    processSigintHandler?.();
    await output.waitFor("Response cancelled.\nYou: ");
    input.write("/exit\n");
    await running;

    expect(
      countOccurrences(output.read(), "Cancelling current response..."),
    ).toBe(1);
    expect(countOccurrences(output.read(), "Response cancelled.")).toBe(1);
    expect(errors.read()).toBe("");
    expect(process.listenerCount("SIGINT")).toBe(initialSigintListeners.size);
  });

  it("cleans up readline and process listeners after SIGTERM", async () => {
    const input = new TestTerminalInput();
    const output = captureStream(new TestTerminalOutput());
    const errors = captureStream();
    const initialInputEndListenerCount = input.listenerCount("end");
    const initialSigintListenerCount = process.listenerCount("SIGINT");
    const initialSigtermListeners = new Set(process.listeners("SIGTERM"));
    const application = createApplication(
      input,
      createFakeEngine([]),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    const readline = requireReadline(application);
    const processSigtermHandler = process
      .listeners("SIGTERM")
      .find((listener) => !initialSigtermListeners.has(listener));
    expect(processSigtermHandler).toBeDefined();
    processSigtermHandler?.();
    await running;

    expect(readline.listenerCount("SIGINT")).toBe(0);
    expect(input.listenerCount("end")).toBe(initialInputEndListenerCount);
    expect(process.listenerCount("SIGINT")).toBe(initialSigintListenerCount);
    expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListeners.size);
    expect(output.read()).not.toContain("Cancelling current response...");
    expect(errors.read()).toBe("");
  });

  it("cleans up listeners when startup output throws", async () => {
    const input = new TestTerminalInput();
    const output = new TestTerminalOutput();
    output.write = (() => {
      throw new Error("controlled output failure");
    }) as typeof output.write;
    const errors = captureStream();
    const initialInputEndListenerCount = input.listenerCount("end");
    const initialSigintListenerCount = process.listenerCount("SIGINT");
    const initialSigtermListenerCount = process.listenerCount("SIGTERM");
    const application = createApplication(
      input,
      createFakeEngine([]),
      output,
      errors.stream,
    );

    const running = application.run();
    const readline = requireReadline(application);
    await expect(running).rejects.toThrow("controlled output failure");

    expect(readline.listenerCount("SIGINT")).toBe(0);
    expect(input.listenerCount("end")).toBe(initialInputEndListenerCount);
    expect(process.listenerCount("SIGINT")).toBe(initialSigintListenerCount);
    expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListenerCount);
  });

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
    await output.waitFor("Data directory: C:\\test-data\nYou: ");
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

  it("renders a completed response when no deltas are emitted", async () => {
    const output = captureStream();
    const errors = captureStream();
    const inputs: ConversationTurnInput[] = [];
    const input = new PassThrough();
    const application = createApplication(
      input,
      createScriptedEngine(inputs, [], "Complete response"),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Question\n");
    await output.waitFor("Assistant: Complete response\nYou: ");
    input.write("/info\n");
    await output.waitFor("Data directory: C:\\test-data\nYou: ");
    input.write("/exit\n");
    await running;

    expect(inputs).toHaveLength(1);
    expect(output.read()).toContain("Assistant: Complete response");
    expect(output.read()).toContain("Messages: 2");
    expect(errors.read()).toBe("");
  });

  it("does not duplicate completed content after streaming deltas", async () => {
    const output = captureStream();
    const errors = captureStream();
    const input = new PassThrough();
    const application = createApplication(
      input,
      createScriptedEngine([], ["Hello", " world"], "Hello world"),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Question\n");
    await output.waitFor("Assistant: Hello world\nYou: ");
    input.write("/exit\n");
    await running;

    expect(countOccurrences(output.read(), "Hello world")).toBe(1);
    expect(output.read()).not.toContain("Hello worldHello world");
    expect(errors.read()).toBe("");
  });

  it("does not add a blank line after completed content ending in a newline", async () => {
    const output = captureStream();
    const errors = captureStream();
    const input = new PassThrough();
    const application = createApplication(
      input,
      createScriptedEngine([], [], "Complete response\n"),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Question\n");
    await output.waitFor("Assistant: Complete response\nYou: ");
    input.write("/exit\n");
    await running;

    expect(output.read()).not.toContain("Complete response\n\nYou: ");
    expect(errors.read()).toBe("");
  });

  it("handles an empty completed response and retains the conversation", async () => {
    const output = captureStream();
    const errors = captureStream();
    const input = new PassThrough();
    const application = createApplication(
      input,
      createScriptedEngine([], [], ""),
      output.stream,
      errors.stream,
    );

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Question\n");
    await output.waitFor("You: ", 2);
    input.write("/info\n");
    await output.waitFor("Data directory: C:\\test-data\nYou: ");
    input.write("/exit\n");
    await running;

    expect(output.read()).not.toContain("undefined");
    expect(output.read()).not.toContain("null");
    expect(output.read()).not.toContain("Assistant: \nYou: ");
    expect(output.read()).toContain("Messages: 0");
    expect(errors.read()).toContain("could not be persisted");
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
    await output.waitFor(
      "Available: calculator, format_text, lookup_inventory\nYou: ",
    );
    input.write("/info\n");
    await output.waitFor("Data directory: C:\\test-data\nYou: ");
    input.write("/reset\n");
    await output.waitFor("Revision: 1\nYou: ");
    input.write("/info\n");
    await output.waitFor("You: ", 6);
    input.write("/quit\n");
    await running;

    expect(inputs).toHaveLength(0);
    expect(output.read()).toContain(
      "/help                       Show available commands",
    );
    expect(output.read()).toContain("Tools: off");
    expect(output.read()).toContain("Tools mode: off");
    expect(output.read()).toContain("Registered tools: none");
    expect(output.read()).toContain("Tool execution: disabled");
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
