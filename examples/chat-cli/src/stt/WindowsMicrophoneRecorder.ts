import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, extname, isAbsolute } from "node:path";
import process from "node:process";
import {
  ChatSttConfigurationError,
  ChatSttOutputError,
  ChatSttRecordingAbortError,
  ChatSttRecordingError,
  ChatSttRecordingTimeoutError,
  ChatSttUnsupportedPlatformError,
} from "./errors.js";

const MAX_DEVICE_NAME_LENGTH = 256;
const MAX_TIMEOUT_MS = 600_000;
const MAX_DIAGNOSTIC_BYTES = 4_096;

export interface WindowsMicrophoneRecorderOptions {
  readonly executable: string;
  readonly deviceName: string;
  readonly platform?: NodeJS.Platform;
}

export interface MicrophoneRecordingRequest {
  readonly outputFile: string;
  readonly durationSeconds: number;
}

export interface MicrophoneRecordingOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}

export interface MicrophoneRecordingResult {
  readonly status: "created";
  readonly outputFile: string;
}

export class WindowsMicrophoneRecorder {
  private readonly executable: string;
  private readonly deviceName: string;

  constructor(options: WindowsMicrophoneRecorderOptions) {
    const validated = validateRecorderOptions(options);
    if (validated.platform !== "win32") {
      throw new ChatSttUnsupportedPlatformError();
    }
    this.executable = validated.executable;
    this.deviceName = validated.deviceName;
  }

  async record(
    request: MicrophoneRecordingRequest,
    options: MicrophoneRecordingOptions,
  ): Promise<Readonly<MicrophoneRecordingResult>> {
    const validatedRequest = await validateRecordingRequest(request);
    const validatedOptions = validateProcessOptions(options);
    if (validatedOptions.signal?.aborted) {
      throw new ChatSttRecordingAbortError(
        causeOptions(validatedOptions.signal.reason),
      );
    }
    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "dshow",
      "-i",
      `audio=${this.deviceName}`,
      "-t",
      String(validatedRequest.durationSeconds),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-n",
      validatedRequest.outputFile,
    ];
    await runRecorderProcess(this.executable, args, validatedOptions);
    await validateWaveOutput(validatedRequest.outputFile);
    return Object.freeze({
      status: "created" as const,
      outputFile: validatedRequest.outputFile,
    });
  }
}

function validateRecorderOptions(options: unknown): {
  readonly executable: string;
  readonly deviceName: string;
  readonly platform: NodeJS.Platform;
} {
  if (!isPlainObject(options)) throw new ChatSttConfigurationError();
  for (const key of Object.keys(options)) {
    if (key !== "executable" && key !== "deviceName" && key !== "platform") {
      throw new ChatSttConfigurationError();
    }
  }
  const executable = options.executable;
  const deviceName = options.deviceName;
  const platform = options.platform ?? process.platform;
  if (
    typeof executable !== "string" ||
    !isAbsolute(executable) ||
    containsControlCharacters(executable)
  ) {
    throw new ChatSttConfigurationError();
  }
  if (
    typeof deviceName !== "string" ||
    deviceName.trim().length === 0 ||
    deviceName.length > MAX_DEVICE_NAME_LENGTH ||
    containsControlCharacters(deviceName)
  ) {
    throw new ChatSttConfigurationError();
  }
  if (typeof platform !== "string") throw new ChatSttConfigurationError();
  try {
    if (!lstatSync(executable).isFile()) throw new Error("not a file");
  } catch (error) {
    throw new ChatSttConfigurationError({ cause: error });
  }
  return {
    executable,
    deviceName,
    platform: platform as NodeJS.Platform,
  };
}

async function validateRecordingRequest(request: unknown): Promise<{
  readonly outputFile: string;
  readonly durationSeconds: number;
}> {
  if (!isPlainObject(request)) throw new ChatSttRecordingError();
  for (const key of Object.keys(request)) {
    if (key !== "outputFile" && key !== "durationSeconds") {
      throw new ChatSttRecordingError();
    }
  }
  const outputFile = request.outputFile;
  const durationSeconds = request.durationSeconds;
  if (
    typeof outputFile !== "string" ||
    !isAbsolute(outputFile) ||
    containsControlCharacters(outputFile) ||
    extname(outputFile).toLowerCase() !== ".wav"
  ) {
    throw new ChatSttRecordingError();
  }
  if (
    typeof durationSeconds !== "number" ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 1 ||
    durationSeconds > 30
  ) {
    throw new ChatSttRecordingError();
  }
  try {
    if (!(await lstat(dirname(outputFile))).isDirectory()) {
      throw new ChatSttRecordingError();
    }
  } catch (error) {
    if (error instanceof ChatSttRecordingError) throw error;
    throw new ChatSttRecordingError(null, null, { cause: error });
  }
  try {
    await lstat(outputFile);
    throw new ChatSttRecordingError();
  } catch (error) {
    if (error instanceof ChatSttRecordingError) throw error;
    if (!isNotFoundError(error)) {
      throw new ChatSttRecordingError(null, null, { cause: error });
    }
  }
  return { outputFile, durationSeconds };
}

function validateProcessOptions(options: unknown): {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
} {
  if (!isPlainObject(options)) throw new ChatSttRecordingError();
  for (const key of Object.keys(options)) {
    if (key !== "signal" && key !== "timeoutMs") {
      throw new ChatSttRecordingError();
    }
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new ChatSttRecordingError();
  }
  if (
    typeof options.timeoutMs !== "number" ||
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new ChatSttRecordingError();
  }
  return options.signal === undefined
    ? { timeoutMs: options.timeoutMs }
    : { signal: options.signal as AbortSignal, timeoutMs: options.timeoutMs };
}

async function runRecorderProcess(
  executable: string,
  args: readonly string[],
  options: { readonly signal?: AbortSignal; readonly timeoutMs: number },
): Promise<void> {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(executable, [...args], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new ChatSttRecordingError(null, null, { cause: error });
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let terminationError:
      | ChatSttRecordingAbortError
      | ChatSttRecordingTimeoutError
      | undefined;
    let diagnosticBytes = 0;
    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      child.stderr?.removeListener("data", onDiagnostic);
    };
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const terminate = (): boolean => {
      try {
        return child.kill();
      } catch {
        return false;
      }
    };
    const onAbort = (): void => {
      if (terminationError !== undefined) return;
      terminationError = new ChatSttRecordingAbortError(
        causeOptions(options.signal?.reason),
      );
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      terminate();
    };
    const onTimeout = (): void => {
      if (terminationError !== undefined) return;
      terminationError = new ChatSttRecordingTimeoutError(options.timeoutMs);
      options.signal?.removeEventListener("abort", onAbort);
      terminate();
    };
    const onError = (error: Error): void => {
      if (terminationError === undefined) {
        settle(new ChatSttRecordingError(null, null, { cause: error }));
      }
    };
    const onClose = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (terminationError !== undefined) {
        settle(terminationError);
        return;
      }
      if (code === 0 && signal === null) settle();
      else settle(new ChatSttRecordingError(code, signal));
    };
    const onDiagnostic = (chunk: Buffer | string): void => {
      if (diagnosticBytes >= MAX_DIAGNOSTIC_BYTES) return;
      diagnosticBytes += Math.min(
        Buffer.byteLength(chunk),
        MAX_DIAGNOSTIC_BYTES - diagnosticBytes,
      );
    };
    const timer = setTimeout(onTimeout, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", onError);
    child.once("close", onClose);
    child.stderr?.on("data", onDiagnostic);
  });
}

async function validateWaveOutput(outputFile: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(outputFile);
  } catch (error) {
    throw new ChatSttOutputError("missing", { cause: error });
  }
  if (!stats.isFile()) throw new ChatSttOutputError("not-file");
  if (stats.size === 0) throw new ChatSttOutputError("empty");
  if (stats.size < 12) throw new ChatSttOutputError("invalid-wave");
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(outputFile, "r");
  } catch (error) {
    throw new ChatSttOutputError("invalid-wave", { cause: error });
  }
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    if (
      bytesRead !== 12 ||
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new ChatSttOutputError("invalid-wave");
    }
  } finally {
    await handle.close();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function causeOptions(cause: unknown): ErrorOptions | undefined {
  return cause === undefined ? undefined : { cause };
}
