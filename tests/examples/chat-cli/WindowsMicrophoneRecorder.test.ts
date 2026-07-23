import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WindowsMicrophoneRecorder } from "../../../examples/chat-cli/src/stt/WindowsMicrophoneRecorder.js";
import {
  ChatSttConfigurationError,
  type ChatSttOutputError,
  ChatSttRecordingAbortError,
  ChatSttRecordingError,
  ChatSttRecordingTimeoutError,
  ChatSttUnsupportedPlatformError,
} from "../../../examples/chat-cli/src/stt/errors.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

class FakeChildProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);
}

const spawnMock = vi.mocked(spawn);
let directory: string;
let executable: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agentforge-recorder-test-"));
  executable = join(directory, "ffmpeg & literal.exe");
  await writeFile(executable, "executable");
  spawnMock.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe("WindowsMicrophoneRecorder", () => {
  it("rejects non-Windows and malformed configuration before spawning", () => {
    expect(
      () =>
        new WindowsMicrophoneRecorder({
          executable,
          deviceName: "Microphone",
          platform: "linux",
        }),
    ).toThrow(ChatSttUnsupportedPlatformError);
    for (const options of [
      undefined,
      { executable: "relative.exe", deviceName: "Microphone" },
      { executable, deviceName: "" },
      { executable, deviceName: "bad\0device" },
      { executable, deviceName: "x".repeat(257) },
      { executable, deviceName: "Microphone", extra: true },
    ]) {
      expect(() => new WindowsMicrophoneRecorder(options as never)).toThrow(
        ChatSttConfigurationError,
      );
    }
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([1, 30])(
    "spawns FFmpeg directly with exact arguments at duration %d",
    async (durationSeconds) => {
      const child = useChild();
      const outputFile = join(directory, `recording ${durationSeconds}.wav`);
      const deviceName = 'Microphone (USB) & "literal"';
      const promise = new WindowsMicrophoneRecorder({
        executable,
        deviceName,
        platform: "win32",
      }).record({ outputFile, durationSeconds }, { timeoutMs: 1_000 });
      await waitForSpawnCount(1);
      expect(spawnMock).toHaveBeenCalledWith(
        executable,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "dshow",
          "-i",
          `audio=${deviceName}`,
          "-t",
          String(durationSeconds),
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "pcm_s16le",
          "-n",
          outputFile,
        ],
        {
          shell: false,
          stdio: ["ignore", "ignore", "pipe"],
          windowsHide: true,
        },
      );
      await writeValidWave(outputFile);
      child.emit("close", 0, null);
      const result = await promise;
      expect(result).toEqual({ status: "created", outputFile });
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it.each([0, 31, 1.5, Number.NaN])(
    "rejects duration %s before spawning",
    async (durationSeconds) => {
      await expect(
        createRecorder().record(
          { outputFile: join(directory, "invalid.wav"), durationSeconds },
          { timeoutMs: 1_000 },
        ),
      ).rejects.toBeInstanceOf(ChatSttRecordingError);
      expect(spawnMock).not.toHaveBeenCalled();
    },
  );

  it("rejects existing, relative, wrong-suffix, and malformed output requests", async () => {
    const existing = join(directory, "existing.wav");
    await writeFile(existing, "existing");
    for (const request of [
      { outputFile: existing, durationSeconds: 5 },
      { outputFile: "relative.wav", durationSeconds: 5 },
      { outputFile: join(directory, "recording.mp3"), durationSeconds: 5 },
      { outputFile: join(directory, "bad\0.wav"), durationSeconds: 5 },
      {
        outputFile: join(directory, "extra.wav"),
        durationSeconds: 5,
        extra: true,
      },
    ]) {
      await expect(
        createRecorder().record(request as never, { timeoutMs: 1_000 }),
      ).rejects.toBeInstanceOf(ChatSttRecordingError);
    }
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("distinguishes pre-abort, active abort, and timeout", async () => {
    await expect(
      createRecorder().record(
        { outputFile: join(directory, "pre-abort.wav"), durationSeconds: 5 },
        { signal: AbortSignal.abort(), timeoutMs: 1_000 },
      ),
    ).rejects.toBeInstanceOf(ChatSttRecordingAbortError);
    expect(spawnMock).not.toHaveBeenCalled();

    const abortChild = useChild();
    const controller = new AbortController();
    const aborted = createRecorder().record(
      { outputFile: join(directory, "abort.wav"), durationSeconds: 5 },
      { signal: controller.signal, timeoutMs: 1_000 },
    );
    const abortError = captureRejection(aborted);
    let abortSettled = false;
    void abortError.then(() => {
      abortSettled = true;
    });
    await waitForSpawnCount(1);
    controller.abort();
    expect(abortChild.kill).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(abortSettled).toBe(false);
    abortChild.emit("close", null, "SIGTERM");
    expect(await abortError).toBeInstanceOf(ChatSttRecordingAbortError);

    vi.useFakeTimers();
    const timeoutChild = useChild();
    const timedOut = createRecorder().record(
      { outputFile: join(directory, "timeout.wav"), durationSeconds: 5 },
      { timeoutMs: 50 },
    );
    const timeoutError = captureRejection(timedOut);
    let timeoutSettled = false;
    void timeoutError.then(() => {
      timeoutSettled = true;
    });
    await waitForSpawnCount(2);
    await vi.advanceTimersByTimeAsync(50);
    expect(timeoutSettled).toBe(false);
    timeoutChild.emit("close", null, "SIGTERM");
    expect(await timeoutError).toBeInstanceOf(ChatSttRecordingTimeoutError);
    expect(timeoutChild.kill).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined, "missing"],
    ["empty", Buffer.alloc(0), "empty"],
    ["invalid", Buffer.from("NOTWAVEFORMAT"), "invalid-wave"],
  ] as const)("rejects %s WAV output", async (name, content, reason) => {
    const child = useChild();
    const outputFile = join(directory, `${name}.wav`);
    const rejection = captureRejection(
      createRecorder().record(
        { outputFile, durationSeconds: 5 },
        { timeoutMs: 1_000 },
      ),
    );
    await waitForSpawnCount(1);
    if (content !== undefined) await writeFile(outputFile, content);
    child.emit("close", 0, null);
    expect(await rejection).toMatchObject<Partial<ChatSttOutputError>>({
      reason,
    });
  });

  it("classifies spawn and process failures without retry or diagnostic disclosure", async () => {
    spawnMock.mockImplementationOnce(() => {
      throw new Error("private device and path");
    });
    const first = await captureRejection(
      createRecorder().record(
        { outputFile: join(directory, "spawn.wav"), durationSeconds: 5 },
        { timeoutMs: 1_000 },
      ),
    );
    expect(first).toBeInstanceOf(ChatSttRecordingError);
    expect((first as Error).message).not.toContain("private device");

    for (const [name, trigger] of [
      [
        "async-error",
        (child: FakeChildProcess) =>
          child.emit("error", new Error("transport")),
      ],
      ["exit", (child: FakeChildProcess) => child.emit("close", 2, null)],
    ] as const) {
      const child = useChild();
      const expected = spawnMock.mock.calls.length + 1;
      const rejection = captureRejection(
        createRecorder().record(
          { outputFile: join(directory, `${name}.wav`), durationSeconds: 5 },
          { timeoutMs: 1_000 },
        ),
      );
      await waitForSpawnCount(expected);
      child.stderr.write("private device path\u001b[2J".repeat(1_000));
      trigger(child);
      expect(await rejection).toBeInstanceOf(ChatSttRecordingError);
    }
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });
});

function createRecorder(): WindowsMicrophoneRecorder {
  return new WindowsMicrophoneRecorder({
    executable,
    deviceName: "Microphone",
    platform: "win32",
  });
}

function useChild(): FakeChildProcess {
  const child = new FakeChildProcess();
  spawnMock.mockReturnValueOnce(child as never);
  return child;
}

async function writeValidWave(path: string): Promise<void> {
  await writeFile(
    path,
    Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.alloc(4),
      Buffer.from("WAVE", "ascii"),
      Buffer.from("data", "ascii"),
    ]),
  );
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
