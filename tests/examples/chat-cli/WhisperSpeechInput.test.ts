import * as fsPromises from "node:fs/promises";
import { dirname } from "node:path";
import type { WhisperClient } from "@agentforge/whisper-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhisperSpeechInput } from "../../../examples/chat-cli/src/stt/WhisperSpeechInput.js";
import type { WindowsMicrophoneRecorder } from "../../../examples/chat-cli/src/stt/WindowsMicrophoneRecorder.js";
import { ChatSttCleanupError } from "../../../examples/chat-cli/src/stt/errors.js";

describe("WhisperSpeechInput", () => {
  it("records once, transcribes once, reports phases, freezes text, and cleans up", async () => {
    const recordingFiles: string[] = [];
    const outputPrefixes: string[] = [];
    const record = vi.fn(async (request) => {
      recordingFiles.push(request.outputFile);
      await fsPromises.writeFile(request.outputFile, "recording");
      return Object.freeze({
        status: "created" as const,
        outputFile: request.outputFile,
      });
    });
    const transcribe = vi.fn(async (request) => {
      outputPrefixes.push(request.outputPrefix);
      await fsPromises.writeFile(`${request.outputPrefix}.txt`, "recognized");
      return Object.freeze({
        status: "transcribed" as const,
        text: "Dzień dobry.",
      });
    });
    const input = createInput(record, transcribe);
    const phases: string[] = [];
    const result = await input.transcribe(5, {
      onPhase: (phase) => phases.push(phase),
    });

    expect(result).toEqual({ text: "Dzień dobry." });
    expect(Object.isFrozen(result)).toBe(true);
    expect(phases).toEqual(["recording", "transcription"]);
    expect(record).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledOnce();
    expect(dirname(recordingFiles[0] ?? "")).toBe(
      dirname(outputPrefixes[0] ?? ""),
    );
    await expect(
      fsPromises.lstat(dirname(recordingFiles[0] ?? "")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses a unique temporary directory for every operation", async () => {
    const directories: string[] = [];
    const record = vi.fn(async (request) => {
      directories.push(dirname(request.outputFile));
      return { status: "created" as const, outputFile: request.outputFile };
    });
    const transcribe = vi.fn(async () => ({
      status: "transcribed" as const,
      text: "text",
    }));
    const input = createInput(record, transcribe);
    await input.transcribe(1);
    await input.transcribe(1);
    expect(new Set(directories).size).toBe(2);
  });

  it("does not transcribe after recording failure and cleans up", async () => {
    let temporaryDirectory = "";
    const record = vi.fn(async (request) => {
      temporaryDirectory = dirname(request.outputFile);
      throw new Error("recording failed");
    });
    const transcribe = vi.fn();
    await expect(createInput(record, transcribe).transcribe(5)).rejects.toThrow(
      "recording failed",
    );
    expect(transcribe).not.toHaveBeenCalled();
    await expect(fsPromises.lstat(temporaryDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("cleans up after transcription failure and forwards one AbortSignal", async () => {
    let temporaryDirectory = "";
    const controller = new AbortController();
    const record = vi.fn(async (request, options) => {
      temporaryDirectory = dirname(request.outputFile);
      expect(options.signal).toBe(controller.signal);
      return { status: "created" as const, outputFile: request.outputFile };
    });
    const transcribe = vi.fn(async (_request, options) => {
      expect(options.signal).toBe(controller.signal);
      throw new Error("transcription failed");
    });
    await expect(
      createInput(record, transcribe).transcribe(5, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("transcription failed");
    expect(record).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledOnce();
    await expect(fsPromises.lstat(temporaryDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not return or duplicate a transcript when successful cleanup fails", async () => {
    const record = vi.fn(async (request) => ({
      status: "created" as const,
      outputFile: request.outputFile,
    }));
    const transcribe = vi.fn(async () => ({
      status: "transcribed" as const,
      text: "recognized once",
    }));
    const removeTemporaryDirectory = vi
      .fn<(directory: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      createInput(record, transcribe, removeTemporaryDirectory).transcribe(5),
    ).rejects.toBeInstanceOf(ChatSttCleanupError);
    expect(record).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledOnce();
  });
});

function createInput(
  record: ReturnType<typeof vi.fn>,
  transcribe: ReturnType<typeof vi.fn>,
  removeTemporaryDirectory?: (directory: string) => Promise<void>,
): WhisperSpeechInput {
  return new WhisperSpeechInput(
    { record } as unknown as WindowsMicrophoneRecorder,
    { transcribe } as unknown as WhisperClient,
    1_000,
    removeTemporaryDirectory,
  );
}
