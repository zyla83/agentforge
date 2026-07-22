import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  PiperAbortError,
  PiperClient,
  PiperConfigurationError,
  PiperOutputError,
  PiperProcessError,
  PiperRequestError,
  PiperResourceError,
  PiperTimeoutError,
  PiperTransportError,
} from "@agentforge/piper-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);
  readonly stdinChunks: Buffer[] = [];

  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => this.stdinChunks.push(chunk));
  }

  get stdinText(): string {
    return Buffer.concat(this.stdinChunks).toString("utf8");
  }
}

const spawnMock = vi.mocked(spawn);
let directory: string;
let executable: string;
let model: string;
let config: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agentforge-piper-client-test-"));
  executable = join(directory, "piper executable & safe.exe");
  model = join(directory, "voice model $().onnx");
  config = join(directory, "voice model $().onnx.json");
  await Promise.all([
    writeFile(executable, "test executable"),
    writeFile(model, "test model"),
    writeFile(config, "{}"),
  ]);
  spawnMock.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe("PiperClient configuration", () => {
  it("accepts and preserves explicit regular-file paths", () => {
    expect(() => new PiperClient({ executable, model, config })).not.toThrow();
  });

  it.each([
    undefined,
    null,
    [],
    { executable: "relative", model: "relative.onnx" },
    { executable: "", model: "" },
    { executable: "bad\0path", model: "bad\0voice.onnx" },
    { executable: "C:\\piper.exe", model: "C:\\voice.txt" },
    {
      executable: "C:\\piper.exe",
      model: "C:\\voice.onnx",
      config: "C:\\voice.json",
    },
    { executable: "C:\\piper.exe", model: "C:\\voice.onnx", extra: true },
  ])("rejects malformed options %# before spawning", (value) => {
    expect(() => new PiperClient(value as never)).toThrow(
      PiperConfigurationError,
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("classifies unavailable executable, model, and config files", () => {
    for (const [resource, options] of [
      ["executable", { executable: join(directory, "missing.exe"), model }],
      ["model", { executable, model: join(directory, "missing.onnx") }],
      [
        "config",
        {
          executable,
          model,
          config: join(directory, "missing.onnx.json"),
        },
      ],
    ] as const) {
      try {
        new PiperClient(options);
        throw new Error("Expected configuration to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(PiperResourceError);
        expect((error as PiperResourceError).resource).toBe(resource);
      }
    }
  });
});

describe("PiperClient synthesis", () => {
  it("spawns Piper directly with exact arguments and writes text only to stdin", async () => {
    const child = useChild();
    const outputFile = join(directory, "speech.wav");
    const text =
      "Zażółć gęślą jaźń. Quotes \"'\n$() ` | & ; < > remain literal.";
    const promise = new PiperClient({ executable, model, config }).synthesize({
      text,
      outputFile,
    });

    await waitForSpawnCount(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      executable,
      ["--model", model, "--config", config, "--output_file", outputFile],
      {
        env: expect.objectContaining({ PYTHONIOENCODING: "utf-8" }),
        shell: false,
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain(text);
    expect(child.stdinText).toBe(text);

    await writeValidWave(outputFile);
    child.emit("close", 0, null);
    const result = await promise;
    expect(result).toEqual({ status: "created", outputFile });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("omits the config arguments completely when no config is supplied", async () => {
    const child = useChild();
    const outputFile = join(directory, "without-config.wav");
    const promise = new PiperClient({ executable, model }).synthesize({
      text: "Speak once.",
      outputFile,
    });
    await waitForSpawnCount(1);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      "--model",
      model,
      "--output_file",
      outputFile,
    ]);
    await writeValidWave(outputFile);
    child.emit("close", 0, null);
    await promise;
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { text: 42, outputFile: "x.wav" },
    { text: "", outputFile: "x.wav" },
    { text: " \t\n", outputFile: "x.wav" },
    { text: "\0", outputFile: "x.wav" },
    { text: "valid\0text", outputFile: "x.wav" },
    { text: "x".repeat(16_001), outputFile: "x.wav" },
    { text: "hello", outputFile: "relative.wav" },
    { text: "hello", outputFile: "C:\\output.txt" },
    { text: "hello", outputFile: "C:\\bad\0.wav" },
    { text: "hello", outputFile: "C:\\output.wav", extra: true },
  ])("rejects malformed request %# before spawning", async (request) => {
    await expect(
      new PiperClient({ executable, model }).synthesize(request as never),
    ).rejects.toBeInstanceOf(PiperRequestError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects an existing target, non-directory parent, and reused target", async () => {
    const client = new PiperClient({ executable, model });
    const existing = join(directory, "existing.wav");
    await writeFile(existing, "existing");
    await expect(
      client.synthesize({ text: "hello", outputFile: existing }),
    ).rejects.toBeInstanceOf(PiperRequestError);

    const parentFile = join(directory, "not-directory");
    await writeFile(parentFile, "file");
    await expect(
      client.synthesize({
        text: "hello",
        outputFile: join(parentFile, "speech.wav"),
      }),
    ).rejects.toBeInstanceOf(PiperRequestError);

    const reused = join(directory, "reused.wav");
    const child = useChild();
    const first = client.synthesize({ text: "first", outputFile: reused });
    const firstError = captureRejection(first);
    await waitForSpawnCount(1);
    child.emit("close", 1, null);
    expect(await firstError).toBeInstanceOf(PiperProcessError);
    await expect(
      client.synthesize({ text: "second", outputFile: reused }),
    ).rejects.toBeInstanceOf(PiperRequestError);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    { signal: "no" },
    { timeoutMs: 0 },
    { timeoutMs: 1.5 },
    { timeoutMs: Number.POSITIVE_INFINITY },
    { timeoutMs: 600_001 },
    { extra: true },
  ])(
    "rejects malformed synthesis options %# before spawning",
    async (options) => {
      await expect(
        new PiperClient({ executable, model }).synthesize(
          { text: "hello", outputFile: join(directory, "options.wav") },
          options as never,
        ),
      ).rejects.toBeInstanceOf(PiperRequestError);
      expect(spawnMock).not.toHaveBeenCalled();
    },
  );

  it("distinguishes pre-abort, mid-synthesis abort, and timeout", async () => {
    const client = new PiperClient({ executable, model });
    await expect(
      client.synthesize(
        { text: "hello", outputFile: join(directory, "pre-abort.wav") },
        { signal: AbortSignal.abort("stop") },
      ),
    ).rejects.toBeInstanceOf(PiperAbortError);
    expect(spawnMock).not.toHaveBeenCalled();

    const abortChild = useChild();
    const controller = new AbortController();
    const aborted = client.synthesize(
      { text: "hello", outputFile: join(directory, "aborted.wav") },
      { signal: controller.signal },
    );
    const abortError = captureRejection(aborted);
    await waitForSpawnCount(1);
    controller.abort("stop");
    abortChild.emit("close", null, "SIGTERM");
    expect(await abortError).toBeInstanceOf(PiperAbortError);
    expect(abortChild.kill).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const timeoutChild = useChild();
    const timedOut = client.synthesize(
      { text: "hello", outputFile: join(directory, "timeout.wav") },
      { timeoutMs: 50 },
    );
    const timeoutError = captureRejection(timedOut);
    await waitForSpawnCount(2);
    await vi.advanceTimersByTimeAsync(50);
    timeoutChild.emit("close", null, "SIGTERM");
    expect(await timeoutError).toBeInstanceOf(PiperTimeoutError);
    expect(timeoutChild.kill).toHaveBeenCalledTimes(1);
  });

  it("classifies spawn, stdin, non-zero, null, and signalled failures without retry", async () => {
    spawnMock.mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });
    await expect(
      new PiperClient({ executable, model }).synthesize({
        text: "secret assistant text",
        outputFile: join(directory, "spawn.wav"),
      }),
    ).rejects.toBeInstanceOf(PiperTransportError);

    for (const [name, trigger, errorType] of [
      [
        "stdin",
        (child: FakeChildProcess) =>
          child.stdin.emit("error", new Error("input failed")),
        PiperTransportError,
      ],
      [
        "nonzero",
        (child: FakeChildProcess) => child.emit("close", 2, null),
        PiperProcessError,
      ],
      [
        "null",
        (child: FakeChildProcess) => child.emit("close", null, null),
        PiperProcessError,
      ],
      [
        "signal",
        (child: FakeChildProcess) => child.emit("close", null, "SIGTERM"),
        PiperProcessError,
      ],
    ] as const) {
      const child = useChild();
      const expectedSpawnCount = spawnMock.mock.calls.length + 1;
      const promise = new PiperClient({ executable, model }).synthesize({
        text: "secret assistant text",
        outputFile: join(directory, `${name}.wav`),
      });
      const rejection = captureRejection(promise);
      await waitForSpawnCount(expectedSpawnCount);
      child.stderr.write("secret assistant text\u001b[31m");
      trigger(child);
      const error = await rejection;
      expect(error).toBeInstanceOf(errorType);
      expect((error as Error).message).not.toContain("secret assistant text");
    }
    expect(spawnMock).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["missing", undefined, PiperOutputError],
    ["empty", Buffer.alloc(0), PiperOutputError],
    ["short", Buffer.from("RIFF"), PiperOutputError],
    ["invalid", Buffer.from("NOTWAVEFORMAT"), PiperOutputError],
  ] as const)("rejects %s WAV output", async (name, content, errorType) => {
    const child = useChild();
    const outputFile = join(directory, `${name}.wav`);
    const promise = new PiperClient({ executable, model }).synthesize({
      text: "hello",
      outputFile,
    });
    const rejection = captureRejection(promise);
    await waitForSpawnCount(1);
    if (content !== undefined) await writeFile(outputFile, content);
    child.emit("close", 0, null);
    expect(await rejection).toBeInstanceOf(errorType);
  });

  it("rejects a directory output and settles duplicate close events exactly once", async () => {
    const child = useChild();
    const outputFile = join(directory, "directory.wav");
    const promise = new PiperClient({ executable, model }).synthesize({
      text: "hello",
      outputFile,
    });
    const rejection = captureRejection(promise);
    await waitForSpawnCount(1);
    await mkdir(outputFile);
    child.emit("close", 0, null);
    child.emit("close", 2, null);
    expect(await rejection).toMatchObject({ reason: "not-file" });
    expect(child.listenerCount("close")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
    expect(child.stdin.listenerCount("error")).toBe(0);
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
