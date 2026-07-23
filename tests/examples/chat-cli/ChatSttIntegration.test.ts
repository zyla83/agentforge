import { PassThrough } from "node:stream";
import {
  createConversation,
  createInMemoryConversationStore,
} from "@agentforge/core";
import { describe, expect, it, vi } from "vitest";
import type { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";
import type { ChatSpeechInput } from "../../../examples/chat-cli/src/stt/ChatSpeechInput.js";
import type { ChatSpeechOutput } from "../../../examples/chat-cli/src/tts/ChatSpeechOutput.js";
import {
  captureStream,
  createCompletedEngine,
  createTestApplication,
} from "./chatTestUtils.js";

describe("chat CLI local STT integration", () => {
  it("keeps STT off by default and rejects /voice non-fatally", async () => {
    const inputs = [];
    const scenario = await createScenario(createCompletedEngine(inputs));
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/voice\n");
    await scenario.output.waitFor("You: ", 2);
    scenario.input.write("typed input\n");
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.content).toBe("typed input");
    expect(scenario.errors.read()).toContain("Voice input is not configured");
    expect(scenario.output.read()).toContain("STT: off");
  });

  it("uses the configured default duration and submits recognized text through the ordinary turn", async () => {
    const inputs = [];
    const transcribe = vi
      .fn<ChatSpeechInput["transcribe"]>()
      .mockResolvedValue(Object.freeze({ text: "Zażółć gęślą jaźń." }));
    const scenario = await createScenario(createCompletedEngine(inputs), {
      stt: {
        mode: "whisper",
        speech: { transcribe },
        language: "pl",
        defaultDurationSeconds: 7,
      },
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/voice\n");
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcribe.mock.calls[0]?.[0]).toBe(7);
    expect(transcribe.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.content).toBe("Zażółć gęślą jaźń.");
    expect(scenario.output.read()).toContain("You (voice): Zażółć gęślą jaźń.");
    expect(scenario.output.read()).toContain("STT: whisper");
    expect(scenario.output.read()).not.toContain("whisper.exe");
    expect(scenario.output.read()).not.toContain("Microphone (USB)");
  });

  it("shows non-sensitive voice configuration in /help and /info", async () => {
    const transcribe = vi.fn<ChatSpeechInput["transcribe"]>();
    const scenario = await createScenario(createCompletedEngine([]), {
      stt: {
        mode: "whisper",
        speech: { transcribe },
        language: "pl",
        defaultDurationSeconds: 7,
      },
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/help\n");
    await scenario.output.waitFor(
      "Temporary audio deletion is best effort.\nYou: ",
    );
    scenario.input.write("/info\n");
    await scenario.output.waitFor("Data directory: C:\\chat-data\nYou: ");
    scenario.input.write("/exit\n");
    await running;
    expect(scenario.output.read()).toContain("/voice [seconds]");
    expect(scenario.output.read()).toContain("STT language: pl");
    expect(scenario.output.read()).toContain("Voice recording seconds: 7");
    expect(scenario.output.read()).not.toContain("whisper.exe");
    expect(scenario.output.read()).not.toContain("Microphone (USB)");
  });

  it.each([1, 30])("uses explicit accepted duration %d", async (duration) => {
    const transcribe = vi
      .fn<ChatSpeechInput["transcribe"]>()
      .mockResolvedValue({
        text: `duration ${duration}`,
      });
    const scenario = await createScenario(createCompletedEngine([]), {
      stt: enabledStt(transcribe),
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write(`/voice ${duration}\n`);
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;
    expect(transcribe.mock.calls[0]?.[0]).toBe(duration);
  });

  it("sanitizes and bounds the preview without rewriting submitted text", async () => {
    const text = `spoken\n\u001b[31m${"x".repeat(400)}\u001b[0m`;
    const inputs = [];
    const transcribe = vi
      .fn<ChatSpeechInput["transcribe"]>()
      .mockResolvedValue({
        text,
      });
    const scenario = await createScenario(createCompletedEngine(inputs), {
      stt: enabledStt(transcribe),
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/voice\n");
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;

    expect(inputs[0]?.content).toBe(text);
    const previewLine = scenario.output
      .read()
      .split("\n")
      .find((line) => line.startsWith("You (voice):"));
    expect(previewLine).toBeDefined();
    expect(previewLine).not.toContain("\u001b");
    expect(Array.from(previewLine ?? "").length).toBeLessThanOrEqual(313);
  });

  it("does not start a turn for an empty or unusable transcript", async () => {
    const inputs = [];
    const transcribe = vi
      .fn<ChatSpeechInput["transcribe"]>()
      .mockResolvedValue({ text: " \n\t " });
    const scenario = await createScenario(createCompletedEngine(inputs), {
      stt: enabledStt(transcribe),
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/voice\n");
    await scenario.output.waitFor("You: ", 2);
    scenario.input.write("/exit\n");
    await running;
    expect(inputs).toHaveLength(0);
    expect(scenario.errors.read()).toContain("did not produce usable text");
  });

  it("keeps typed chat usable after a voice failure", async () => {
    const inputs = [];
    const transcribe = vi
      .fn<ChatSpeechInput["transcribe"]>()
      .mockRejectedValue(new Error("private path and device"));
    const scenario = await createScenario(createCompletedEngine(inputs), {
      stt: enabledStt(transcribe),
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/voice\n");
    await scenario.output.waitFor("You: ", 2);
    scenario.input.write("typed after failure\n");
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;
    expect(inputs[0]?.content).toBe("typed after failure");
    expect(scenario.errors.read()).toBe(
      "Voice input failed. Text chat remains available.\n",
    );
    expect(scenario.errors.read()).not.toContain("private path");
  });

  it.each([
    ["recording", "Cancelling microphone recording..."],
    ["transcription", "Cancelling voice transcription..."],
  ] as const)(
    "cancels active %s and returns to the prompt",
    async (phase, notice) => {
      let started: (() => void) | undefined;
      const operationStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const transcribe = vi.fn<ChatSpeechInput["transcribe"]>(
        (_duration, options) =>
          new Promise((_resolve, reject) => {
            options?.onPhase?.(phase);
            started?.();
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
          }),
      );
      const inputs = [];
      const scenario = await createScenario(createCompletedEngine(inputs), {
        stt: enabledStt(transcribe),
      });
      const running = scenario.application.run();
      await scenario.output.waitFor("You: ");
      scenario.input.write("/voice\n");
      await operationStarted;
      invokeSigint(scenario.application);
      await scenario.output.waitFor("Voice input cancelled.\nYou: ");
      scenario.input.write("typed after cancellation\n");
      await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
      scenario.input.write("/exit\n");
      await running;

      expect(scenario.output.read()).toContain(notice);
      expect(inputs[0]?.content).toBe("typed after cancellation");
      expect(scenario.errors.read()).toBe("");
    },
  );

  it("supports STT input followed by independently enabled Piper output", async () => {
    const transcribe = vi
      .fn<ChatSpeechInput["transcribe"]>()
      .mockResolvedValue({
        text: "voice question",
      });
    const speak = vi.fn<ChatSpeechOutput["speak"]>().mockResolvedValue();
    const scenario = await createScenario(createCompletedEngine([]), {
      stt: enabledStt(transcribe),
      tts: { mode: "piper", speech: { speak } },
    });
    const running = scenario.application.run();
    await scenario.output.waitFor("You: ");
    scenario.input.write("/voice\n");
    await scenario.output.waitFor("Assistant: Answer 1\nYou: ");
    scenario.input.write("/exit\n");
    await running;
    expect(transcribe).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0]?.[0]).toBe("Answer 1");
  });
});

function enabledStt(transcribe: ChatSpeechInput["transcribe"]) {
  return {
    mode: "whisper" as const,
    speech: { transcribe },
    language: "auto",
    defaultDurationSeconds: 5,
  };
}

async function createScenario(
  engine: Parameters<typeof createTestApplication>[0]["engine"],
  options: {
    readonly stt?: Parameters<typeof createTestApplication>[0]["stt"];
    readonly tts?: Parameters<typeof createTestApplication>[0]["tts"];
  } = {},
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
    stt: options.stt,
    tts: options.tts,
  });
  return { application, input, output, errors };
}

function invokeSigint(application: ChatApplication): void {
  (
    application as unknown as {
      readonly handleSigint: () => void;
    }
  ).handleSigint();
}
