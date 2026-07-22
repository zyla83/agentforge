import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WINDOWS_WAV_PLAYBACK_SCRIPT,
  WindowsWavPlayer,
} from "../../../examples/chat-cli/src/tts/WindowsWavPlayer.js";
import {
  ChatTtsPlaybackAbortError,
  ChatTtsPlaybackError,
  ChatTtsPlaybackTimeoutError,
  ChatTtsUnsupportedPlatformError,
} from "../../../examples/chat-cli/src/tts/errors.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

class FakePlaybackProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);
}

const spawnMock = vi.mocked(spawn);
let directory: string;
let wavFile: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agentforge-piper-"));
  wavFile = join(directory, "speech.wav");
  await writeFile(wavFile, "RIFF0000WAVEdata");
  spawnMock.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe("WindowsWavPlayer", () => {
  it("spawns one fixed non-interactive PowerShell command and passes the WAV path literally", async () => {
    const metacharDirectory = join(
      tmpdir(),
      `agentforge-piper-$() & literal-${Date.now()}`,
    );
    await mkdir(metacharDirectory);
    const literalPath = join(metacharDirectory, "speech.wav");
    await writeFile(literalPath, "RIFF0000WAVEdata");
    const child = useChild();
    const promise = new WindowsWavPlayer(literalPath, "win32").play();

    await waitForSpawnCount(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        WINDOWS_WAV_PLAYBACK_SCRIPT,
        literalPath,
      ],
      {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    expect(WINDOWS_WAV_PLAYBACK_SCRIPT).toMatch(/^& \{.*\}$/u);
    expect(WINDOWS_WAV_PLAYBACK_SCRIPT).toContain("$args[0]");
    expect(WINDOWS_WAV_PLAYBACK_SCRIPT).not.toContain(literalPath);
    expect(WINDOWS_WAV_PLAYBACK_SCRIPT).not.toMatch(
      /Start-Process|volume|device|mixer|Set-/iu,
    );
    child.emit("close", 0, null);
    await promise;
    await rm(metacharDirectory, { recursive: true, force: true });
  });

  it("rejects non-Windows use and unapproved paths before spawning", async () => {
    expect(() => new WindowsWavPlayer(wavFile, "linux")).toThrow(
      ChatTtsUnsupportedPlatformError,
    );
    for (const path of [
      join(directory, "other.wav"),
      join(tmpdir(), "speech.wav"),
      "relative\\speech.wav",
      `${wavFile}\0`,
    ]) {
      expect(() => new WindowsWavPlayer(path, "win32")).toThrow(
        ChatTtsPlaybackError,
      );
    }
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects missing and non-file WAV targets before spawning", async () => {
    await rm(wavFile);
    await expect(
      new WindowsWavPlayer(wavFile, "win32").play(),
    ).rejects.toBeInstanceOf(ChatTtsPlaybackError);
    await mkdir(wavFile);
    await expect(
      new WindowsWavPlayer(wavFile, "win32").play(),
    ).rejects.toBeInstanceOf(ChatTtsPlaybackError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("distinguishes pre-abort, mid-playback abort, and timeout", async () => {
    await expect(
      new WindowsWavPlayer(wavFile, "win32").play({
        signal: AbortSignal.abort("stop"),
      }),
    ).rejects.toBeInstanceOf(ChatTtsPlaybackAbortError);
    expect(spawnMock).not.toHaveBeenCalled();

    const abortChild = useChild();
    const controller = new AbortController();
    const aborted = new WindowsWavPlayer(wavFile, "win32").play({
      signal: controller.signal,
    });
    const abortError = captureRejection(aborted);
    await waitForSpawnCount(1);
    controller.abort("stop");
    abortChild.emit("close", null, "SIGTERM");
    expect(await abortError).toBeInstanceOf(ChatTtsPlaybackAbortError);
    expect(abortChild.kill).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const timeoutChild = useChild();
    const timedOut = new WindowsWavPlayer(wavFile, "win32").play({
      timeoutMs: 25,
    });
    const timeoutError = captureRejection(timedOut);
    await waitForSpawnCount(2);
    await vi.advanceTimersByTimeAsync(25);
    timeoutChild.emit("close", null, "SIGTERM");
    expect(await timeoutError).toBeInstanceOf(ChatTtsPlaybackTimeoutError);
    expect(timeoutChild.kill).toHaveBeenCalledTimes(1);
  });

  it("classifies spawn and non-zero process failures without retry", async () => {
    spawnMock.mockImplementationOnce(() => {
      throw new Error("powershell missing");
    });
    await expect(
      new WindowsWavPlayer(wavFile, "win32").play(),
    ).rejects.toBeInstanceOf(ChatTtsPlaybackError);

    const child = useChild();
    const failed = new WindowsWavPlayer(wavFile, "win32").play();
    const failure = captureRejection(failed);
    await waitForSpawnCount(2);
    child.stderr.write("untrusted diagnostic\u001b[31m");
    child.emit("close", 1, null);
    expect(await failure).toMatchObject({ exitCode: 1 });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it("settles error and close races once and removes listeners", async () => {
    const child = useChild();
    const promise = new WindowsWavPlayer(wavFile, "win32").play();
    const rejection = captureRejection(promise);
    await waitForSpawnCount(1);
    child.emit("error", new Error("spawn failure"));
    child.emit("close", 0, null);
    expect(await rejection).toBeInstanceOf(ChatTtsPlaybackError);
    expect(child.listenerCount("error")).toBe(0);
    expect(child.listenerCount("close")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
  });

  it.each([
    null,
    [],
    { signal: "invalid" },
    { timeoutMs: 0 },
    { timeoutMs: 1.5 },
    { timeoutMs: 600_001 },
    { unknown: true },
  ])("rejects malformed options %# before spawning", async (options) => {
    await expect(
      new WindowsWavPlayer(wavFile, "win32").play(options as never),
    ).rejects.toBeInstanceOf(ChatTtsPlaybackError);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

function useChild(): FakePlaybackProcess {
  const child = new FakePlaybackProcess();
  spawnMock.mockReturnValueOnce(child as never);
  return child;
}

async function waitForSpawnCount(count: number): Promise<void> {
  await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(count));
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject.");
}
