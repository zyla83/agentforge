import { PassThrough } from "node:stream";
import {
  appendConversationMessage,
  createConversation,
  createInMemoryConversationStore,
} from "@agentforge/core";
import type {
  ConversationEngine,
  ConversationTurnInput,
} from "@agentforge/core";
import { LLMFinishReason, LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";
import type { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";
import type { ChatSpeechOutput } from "../../../examples/chat-cli/src/tts/ChatSpeechOutput.js";
import {
  captureStream,
  createCompletedEngine,
  createTestApplication,
  requireLast,
} from "./chatTestUtils.js";

describe("chat CLI Piper speech integration", () => {
  it("keeps speech disabled by default", async () => {
    const speak = vi.fn<ChatSpeechOutput["speak"]>();
    const scenario = await createScenario(createCompletedEngine([]), {
      mode: "off",
      speech: { speak },
    });

    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("Question\n");
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(speak).not.toHaveBeenCalled();
    expect(scenario.output.read()).toContain("TTS: off");
  });

  it("speaks the exact final assistant response once after streaming completes", async () => {
    const speak = vi.fn<ChatSpeechOutput["speak"]>().mockResolvedValue();
    const scenario = await createScenario(
      createScriptedEngine(["Final ", "answer."], "Final answer."),
      {
        mode: "piper",
        speech: { speak },
      },
    );

    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("Question\n");
    await scenario.output.waitFor("Assistant: Final answer.\nYou: ");
    scenario.input.write("/info\n");
    await scenario.output.waitFor("Data directory: C:\\chat-data\nYou: ");

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0]).toBe("Final answer.");
    expect(speak.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(scenario.output.read()).toContain("TTS: piper");
    expect(scenario.output.read()).not.toContain("piper.exe");
    scenario.input.write("/exit\n");
    await running;
  });

  it("speaks completed content when the provider emits no deltas", async () => {
    const speak = vi.fn<ChatSpeechOutput["speak"]>().mockResolvedValue();
    const scenario = await createScenario(
      createScriptedEngine([], "Completed only."),
      {
        mode: "piper",
        speech: { speak },
      },
    );

    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("Question\n");
    await scenario.output.waitFor("Assistant: Completed only.\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(speak).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith("Completed only.", {
      signal: expect.any(AbortSignal),
    });
  });

  it("reports a speech failure without losing text or blocking the next turn", async () => {
    const speak = vi
      .fn<ChatSpeechOutput["speak"]>()
      .mockRejectedValueOnce(new Error("private Piper diagnostic"))
      .mockResolvedValueOnce();
    const scenario = await createScenario(createCompletedEngine([]), {
      mode: "piper",
      speech: { speak },
    });

    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("First\n");
    await scenario.output.waitFor("You: ", 2);
    scenario.input.write("Second\n");
    await scenario.output.waitFor("Assistant: Answer 2\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(speak).toHaveBeenCalledTimes(2);
    expect(scenario.output.read()).toContain("Assistant: Answer 1");
    expect(scenario.output.read()).toContain("Assistant: Answer 2");
    expect(scenario.errors.read()).toBe(
      "Text-to-speech failed. The text response remains available.\n",
    );
    expect(scenario.errors.read()).not.toContain("private Piper diagnostic");
  });

  it("cancels active speech with SIGINT and keeps the chat usable", async () => {
    let announceSpeechStarted: (() => void) | undefined;
    const speechStarted = new Promise<void>((resolve) => {
      announceSpeechStarted = resolve;
    });
    const speak = vi
      .fn<ChatSpeechOutput["speak"]>()
      .mockImplementationOnce(
        (_text, options) =>
          new Promise<void>((_resolve, reject) => {
            announceSpeechStarted?.();
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("speech aborted")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce();
    const scenario = await createScenario(createCompletedEngine([]), {
      mode: "piper",
      speech: { speak },
    });

    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("First\n");
    await speechStarted;
    invokeSigint(scenario.application);
    await scenario.output.waitFor("Speech cancelled.\nYou: ");
    scenario.input.write("Second\n");
    await scenario.output.waitFor("Assistant: Answer 2\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(scenario.output.read()).toContain("Cancelling current speech...");
    expect(speak).toHaveBeenCalledTimes(2);
    expect(scenario.errors.read()).toBe("");
  });

  it("does not speak partial output from a failed turn", async () => {
    const speak = vi.fn<ChatSpeechOutput["speak"]>().mockResolvedValue();
    const engine = {
      async *streamTurn() {
        yield {
          type: "delta",
          delta: "partial output",
          content: "partial output",
          provider: "ollama",
          model: "model",
          profile: "interactive-chat",
        } as const;
        throw new Error("provider failed");
      },
    } as unknown as ConversationEngine;
    const scenario = await createScenario(engine, {
      mode: "piper",
      speech: { speak },
    });

    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("Question\n");
    await scenario.output.waitFor("You: ", 2);
    scenario.input.write("/exit\n");
    await running;

    expect(speak).not.toHaveBeenCalled();
    expect(scenario.output.read()).toContain("Assistant: partial output");
    expect(scenario.errors.read()).toContain("provider failed");
  });
});

async function createScenario(
  engine: ConversationEngine,
  tts: Parameters<typeof createTestApplication>[0]["tts"],
) {
  const store = createInMemoryConversationStore();
  const initialEntry = await store.save(createConversation({ id: "active" }));
  const input = new PassThrough();
  const output = captureStream();
  const errors = captureStream();
  const application = createTestApplication({
    input,
    output: output.stream,
    errorOutput: errors.stream,
    engine,
    store,
    initialEntry,
    tts,
  });
  return { application, input, output, errors };
}

function createScriptedEngine(
  deltas: readonly string[],
  completedContent: string,
): ConversationEngine {
  return {
    async *streamTurn(input: ConversationTurnInput) {
      const withUser = appendConversationMessage(input.conversation, {
        role: LLMMessageRole.User,
        content: input.content,
      });
      const completed = appendConversationMessage(withUser, {
        role: LLMMessageRole.Assistant,
        content: completedContent,
      });
      let content = "";
      for (const delta of deltas) {
        content += delta;
        yield {
          type: "delta",
          delta,
          content,
          provider: "ollama",
          model: "model",
          profile: "interactive-chat",
        } as const;
      }
      yield {
        type: "completed",
        conversation: completed,
        userMessage: requireLast(withUser.messages),
        assistantMessage: requireLast(completed.messages),
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

function invokeSigint(application: ChatApplication): void {
  (
    application as unknown as {
      readonly handleSigint: () => void;
    }
  ).handleSigint();
}
