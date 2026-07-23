import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  WhisperAbortError,
  WhisperClient,
  WhisperConfigurationError,
  type WhisperOutputError,
  WhisperProcessError,
  WhisperRequestError,
  WhisperResourceError,
  WhisperTimeoutError,
  WhisperTransportError,
} from "@agentforge/whisper-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

class FakeChildProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);
}

const spawnMock = vi.mocked(spawn);
let directory: string;
let executable: string;
let model: string;
let inputFile: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agentforge-whisper-test-"));
  executable = join(directory, "whisper cli & safe.exe");
  model = join(directory, "multilingual model $().bin");
  inputFile = join(directory, "input recording.wav");
  await Promise.all([
    writeFile(executable, "executable"),
    writeFile(model, "model"),
    writeValidWave(inputFile),
  ]);
  spawnMock.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe("WhisperClient configuration", () => {
  it("accepts explicit files and defaults the language without spawning", () => {
    expect(() => new WhisperClient({ executable, model })).not.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { executable: "relative", model: "relative.bin" },
    { executable: "C:\\whisper.exe", model: "C:\\model.ggml" },
    {
      executable: "C:\\whisper.exe",
      model: "C:\\model.bin",
      language: "pl PL",
    },
    {
      executable: "C:\\whisper.exe",
      model: "C:\\model.bin",
      language: "_".repeat(33),
    },
    { executable: "C:\\whisper.exe", model: "C:\\model.bin", extra: true },
  ])("rejects malformed configuration %#", (options) => {
    expect(() => new WhisperClient(options as never)).toThrow(
      WhisperConfigurationError,
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("classifies unavailable executable and model resources", () => {
    for (const [resource, options] of [
      ["executable", { executable: join(directory, "missing.exe"), model }],
      ["model", { executable, model: join(directory, "missing.bin") }],
    ] as const) {
      expect(() => new WhisperClient(options)).toThrow(
        expect.objectContaining({ resource }),
      );
    }
  });
});

describe("WhisperClient transcription", () => {
  it("spawns whisper-cli directly with exact literal arguments and freezes the result", async () => {
    const child = useChild();
    const outputPrefix = join(directory, "output ; literal");
    const promise = new WhisperClient({
      executable,
      model,
      language: "pl",
    }).transcribe({ inputFile, outputPrefix });

    await waitForSpawnCount(1);
    expect(spawnMock).toHaveBeenCalledWith(
      executable,
      [
        "-m",
        model,
        "-f",
        inputFile,
        "-l",
        "pl",
        "-otxt",
        "-of",
        outputPrefix,
        "-np",
        "-nt",
      ],
      {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    await writeFile(`${outputPrefix}.txt`, "  Zażółć gęślą jaźń.\n", "utf8");
    child.emit("close", 0, null);
    const result = await promise;
    expect(result).toEqual({
      status: "transcribed",
      text: "Zażółć gęślą jaźń.",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { inputFile: "relative.wav", outputPrefix: "relative" },
    { inputFile: "C:\\input.mp3", outputPrefix: "C:\\output" },
    { inputFile: "C:\\bad\0.wav", outputPrefix: "C:\\output" },
    { inputFile: "C:\\input.wav", outputPrefix: "C:\\bad\0" },
    { inputFile: "C:\\input.wav", outputPrefix: "C:\\output", extra: true },
  ])("rejects malformed requests %# before spawning", async (request) => {
    await expect(
      new WhisperClient({ executable, model }).transcribe(request as never),
    ).rejects.toBeInstanceOf(WhisperRequestError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects unavailable input, non-directory parent, and existing output", async () => {
    const client = new WhisperClient({ executable, model });
    await expect(
      client.transcribe({
        inputFile: join(directory, "missing.wav"),
        outputPrefix: join(directory, "missing-input"),
      }),
    ).rejects.toBeInstanceOf(WhisperResourceError);

    const parentFile = join(directory, "parent-file");
    await writeFile(parentFile, "file");
    await expect(
      client.transcribe({
        inputFile,
        outputPrefix: join(parentFile, "output"),
      }),
    ).rejects.toBeInstanceOf(WhisperRequestError);

    const existingPrefix = join(directory, "existing");
    await writeFile(existingPrefix, "existing");
    await expect(
      client.transcribe({ inputFile, outputPrefix: existingPrefix }),
    ).rejects.toBeInstanceOf(WhisperRequestError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    { signal: "invalid" },
    { timeoutMs: 0 },
    { timeoutMs: 1.5 },
    { timeoutMs: 600_001 },
    { extra: true },
  ])("rejects malformed process options %#", async (options) => {
    await expect(
      new WhisperClient({ executable, model }).transcribe(
        { inputFile, outputPrefix: join(directory, "options") },
        options as never,
      ),
    ).rejects.toBeInstanceOf(WhisperRequestError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("distinguishes pre-abort, active abort, and timeout and kills once", async () => {
    const client = new WhisperClient({ executable, model });
    await expect(
      client.transcribe(
        { inputFile, outputPrefix: join(directory, "pre-abort") },
        { signal: AbortSignal.abort("stop") },
      ),
    ).rejects.toBeInstanceOf(WhisperAbortError);
    expect(spawnMock).not.toHaveBeenCalled();

    const abortChild = useChild();
    const controller = new AbortController();
    const aborted = client.transcribe(
      { inputFile, outputPrefix: join(directory, "aborted") },
      { signal: controller.signal },
    );
    const abortError = captureRejection(aborted);
    let abortSettled = false;
    void abortError.then(() => {
      abortSettled = true;
    });
    await waitForSpawnCount(1);
    controller.abort("stop");
    controller.abort("again");
    expect(abortChild.kill).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(abortSettled).toBe(false);
    abortChild.emit("close", null, "SIGTERM");
    expect(await abortError).toBeInstanceOf(WhisperAbortError);

    vi.useFakeTimers();
    const timeoutChild = useChild();
    const timedOut = client.transcribe(
      { inputFile, outputPrefix: join(directory, "timeout") },
      { timeoutMs: 50 },
    );
    const timeoutError = captureRejection(timedOut);
    let timeoutSettled = false;
    void timeoutError.then(() => {
      timeoutSettled = true;
    });
    await waitForSpawnCount(2);
    await vi.advanceTimersByTimeAsync(50);
    expect(timeoutChild.kill).toHaveBeenCalledOnce();
    expect(timeoutSettled).toBe(false);
    timeoutChild.emit("close", null, "SIGTERM");
    expect(await timeoutError).toBeInstanceOf(WhisperTimeoutError);
  });

  it("classifies spawn and process failures without exposing diagnostics or retrying", async () => {
    spawnMock.mockImplementationOnce(() => {
      throw new Error("private path and transcript");
    });
    const client = new WhisperClient({ executable, model });
    const spawnError = await captureRejection(
      client.transcribe({ inputFile, outputPrefix: join(directory, "spawn") }),
    );
    expect(spawnError).toBeInstanceOf(WhisperTransportError);
    expect((spawnError as Error).message).not.toContain(directory);

    for (const [name, trigger, errorType] of [
      [
        "async-error",
        (child: FakeChildProcess) =>
          child.emit("error", new Error("transport")),
        WhisperTransportError,
      ],
      [
        "nonzero",
        (child: FakeChildProcess) => child.emit("close", 2, null),
        WhisperProcessError,
      ],
      [
        "null",
        (child: FakeChildProcess) => child.emit("close", null, null),
        WhisperProcessError,
      ],
      [
        "signal",
        (child: FakeChildProcess) => child.emit("close", null, "SIGTERM"),
        WhisperProcessError,
      ],
    ] as const) {
      const child = useChild();
      const expected = spawnMock.mock.calls.length + 1;
      const rejection = captureRejection(
        client.transcribe({ inputFile, outputPrefix: join(directory, name) }),
      );
      await waitForSpawnCount(expected);
      child.stderr.write("secret transcript\u001b[31m".repeat(1_000));
      trigger(child);
      const error = await rejection;
      expect(error).toBeInstanceOf(errorType);
      expect((error as Error).message).not.toContain("secret transcript");
    }
    expect(spawnMock).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["missing", undefined, "missing"],
    ["empty", Buffer.alloc(0), "empty"],
    ["control", Buffer.from("\n\t"), "control-only"],
    ["invalid-utf8", Buffer.from([0xc3, 0x28]), "invalid"],
    ["terminal-control", Buffer.from("text\u001b[31m"), "invalid"],
    ["oversized", Buffer.alloc(65_537, 0x61), "oversized"],
  ] as const)("rejects %s transcript output", async (name, content, reason) => {
    const child = useChild();
    const outputPrefix = join(directory, name);
    const rejection = captureRejection(
      new WhisperClient({ executable, model }).transcribe({
        inputFile,
        outputPrefix,
      }),
    );
    await waitForSpawnCount(1);
    if (content !== undefined) await writeFile(`${outputPrefix}.txt`, content);
    child.emit("close", 0, null);
    expect(await rejection).toMatchObject<Partial<WhisperOutputError>>({
      reason,
    });
  });

  it("rejects directory output and removes all process listeners after settlement", async () => {
    const child = useChild();
    const outputPrefix = join(directory, "directory-output");
    const promise = new WhisperClient({ executable, model }).transcribe({
      inputFile,
      outputPrefix,
    });
    const rejection = captureRejection(promise);
    await waitForSpawnCount(1);
    await mkdir(`${outputPrefix}.txt`);
    child.emit("close", 0, null);
    child.emit("close", 2, null);
    expect(await rejection).toMatchObject({ reason: "not-file" });
    expect(child.listenerCount("close")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
  });
});

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
