import { access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";
import type {
  PiperClient,
  PiperSynthesisRequest,
} from "@agentforge/piper-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PiperSpeechOutput } from "../../../examples/chat-cli/src/tts/PiperSpeechOutput.js";

const playerState = vi.hoisted(() => ({
  paths: [] as string[],
  play: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../../examples/chat-cli/src/tts/WindowsWavPlayer.js", () => ({
  WindowsWavPlayer: class {
    constructor(path: string) {
      playerState.paths.push(path);
    }

    play = playerState.play;
  },
}));

beforeEach(() => {
  playerState.paths.length = 0;
  playerState.play.mockReset().mockResolvedValue(undefined);
});

describe("PiperSpeechOutput", () => {
  it("creates one OS temporary directory, synthesizes and plays once, then removes it", async () => {
    let synthesizedPath = "";
    const synthesize = vi.fn(async (request: PiperSynthesisRequest) => {
      synthesizedPath = request.outputFile;
      await writeFile(request.outputFile, "RIFF0000WAVEdata");
      return Object.freeze({
        status: "created" as const,
        outputFile: request.outputFile,
      });
    });
    const speech = new PiperSpeechOutput(
      { synthesize } as unknown as PiperClient,
      12_345,
    );

    await speech.speak("Speak this final answer.");

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      { text: "Speak this final answer.", outputFile: synthesizedPath },
      { timeoutMs: 12_345 },
    );
    expect(playerState.paths).toEqual([synthesizedPath]);
    expect(playerState.play).toHaveBeenCalledTimes(1);
    expect(playerState.play).toHaveBeenCalledWith({ timeoutMs: 12_345 });
    expect(resolve(synthesizedPath)).toMatch(
      new RegExp(
        `^${escapeRegExp(resolve(tmpdir()))}${escapeRegExp(sep)}agentforge-piper-`,
        "u",
      ),
    );
    expect(resolve(synthesizedPath)).not.toContain(resolve(process.cwd()));
    await expect(access(synthesizedPath)).rejects.toThrow();
    await expect(access(dirname(synthesizedPath))).rejects.toThrow();
  });

  it("forwards cancellation to synthesis and playback", async () => {
    const controller = new AbortController();
    const synthesize = vi.fn(async (request: PiperSynthesisRequest) => {
      await writeFile(request.outputFile, "RIFF0000WAVEdata");
      return Object.freeze({
        status: "created" as const,
        outputFile: request.outputFile,
      });
    });
    const speech = new PiperSpeechOutput(
      { synthesize } as unknown as PiperClient,
      1_000,
    );
    await speech.speak("Final answer.", { signal: controller.signal });
    expect(synthesize.mock.calls[0]?.[1]).toEqual({
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    expect(playerState.play).toHaveBeenCalledWith({
      signal: controller.signal,
      timeoutMs: 1_000,
    });
  });

  it("cleans the dedicated directory when synthesis fails", async () => {
    let outputFile = "";
    const synthesize = vi.fn(async (request: PiperSynthesisRequest) => {
      outputFile = request.outputFile;
      throw new Error("synthesis failed");
    });
    const speech = new PiperSpeechOutput(
      { synthesize } as unknown as PiperClient,
      1_000,
    );
    await expect(speech.speak("Final answer.")).rejects.toThrow(
      "synthesis failed",
    );
    expect(playerState.play).not.toHaveBeenCalled();
    await expect(access(dirname(outputFile))).rejects.toThrow();
  });

  it("cleans the dedicated directory after synthesis cancellation", async () => {
    let outputFile = "";
    const controller = new AbortController();
    const synthesize = vi.fn(
      async (
        request: PiperSynthesisRequest,
        options?: { readonly signal?: AbortSignal },
      ) => {
        outputFile = request.outputFile;
        await new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
          controller.abort();
        });
        throw new Error("unreachable");
      },
    );
    const speech = new PiperSpeechOutput(
      { synthesize } as unknown as PiperClient,
      1_000,
    );

    await expect(
      speech.speak("Final answer.", { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    await expect(access(dirname(outputFile))).rejects.toThrow();
  });

  it("cleans the WAV and dedicated directory when playback fails", async () => {
    let outputFile = "";
    const synthesize = vi.fn(async (request: PiperSynthesisRequest) => {
      outputFile = request.outputFile;
      await writeFile(request.outputFile, "RIFF0000WAVEdata");
      return Object.freeze({
        status: "created" as const,
        outputFile: request.outputFile,
      });
    });
    playerState.play.mockRejectedValueOnce(new Error("playback failed"));
    const speech = new PiperSpeechOutput(
      { synthesize } as unknown as PiperClient,
      1_000,
    );
    await expect(speech.speak("Final answer.")).rejects.toThrow(
      "playback failed",
    );
    expect(playerState.play).toHaveBeenCalledTimes(1);
    await expect(access(outputFile)).rejects.toThrow();
    await expect(access(dirname(outputFile))).rejects.toThrow();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
