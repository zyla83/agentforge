import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import process from "node:process";
import {
  ChatTtsPlaybackAbortError,
  ChatTtsPlaybackError,
  ChatTtsPlaybackTimeoutError,
  ChatTtsUnsupportedPlatformError,
} from "./errors.js";

const DEFAULT_PLAYBACK_TIMEOUT_MS = 300_000;
const MAX_PLAYBACK_TIMEOUT_MS = 600_000;
const TEMPORARY_DIRECTORY_PREFIX = "agentforge-piper-";
const TEMPORARY_WAV_NAME = "speech.wav";
const POWERSHELL_PLAYBACK_SCRIPT =
  "& { $player = [System.Media.SoundPlayer]::new($args[0]); try { $player.PlaySync() } finally { $player.Dispose() } }";

export interface WindowsWavPlayerOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export class WindowsWavPlayer {
  private readonly wavFile: string;
  private readonly platform: NodeJS.Platform;

  constructor(wavFile: string, platform: NodeJS.Platform = process.platform) {
    this.wavFile = validateApprovedWavPath(wavFile);
    this.platform = platform;
    if (platform !== "win32") throw new ChatTtsUnsupportedPlatformError();
  }

  async play(options?: WindowsWavPlayerOptions): Promise<void> {
    const validated = validatePlaybackOptions(options);
    if (validated.signal?.aborted) {
      throw new ChatTtsPlaybackAbortError(
        causeOptions(validated.signal.reason),
      );
    }
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(this.wavFile);
    } catch (error) {
      throw new ChatTtsPlaybackError(null, null, { cause: error });
    }
    if (!stats.isFile()) throw new ChatTtsPlaybackError();

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          POWERSHELL_PLAYBACK_SCRIPT,
          this.wavFile,
        ],
        {
          shell: false,
          stdio: ["ignore", "ignore", "pipe"],
          windowsHide: true,
        },
      );
    } catch (error) {
      throw new ChatTtsPlaybackError(null, null, { cause: error });
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let terminationError:
        | ChatTtsPlaybackAbortError
        | ChatTtsPlaybackTimeoutError
        | undefined;
      let diagnosticBytes = 0;
      const onDiagnostic = (chunk: Buffer | string): void => {
        if (diagnosticBytes >= 4_096) return;
        diagnosticBytes += Math.min(
          Buffer.byteLength(chunk),
          4_096 - diagnosticBytes,
        );
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        validated.signal?.removeEventListener("abort", onAbort);
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
        terminationError = new ChatTtsPlaybackAbortError(
          causeOptions(validated.signal?.reason),
        );
        clearTimeout(timer);
        validated.signal?.removeEventListener("abort", onAbort);
        if (!terminate()) settle(terminationError);
      };
      const onTimeout = (): void => {
        if (terminationError !== undefined) return;
        terminationError = new ChatTtsPlaybackTimeoutError(validated.timeoutMs);
        validated.signal?.removeEventListener("abort", onAbort);
        if (!terminate()) settle(terminationError);
      };
      const onError = (error: Error): void => {
        settle(
          terminationError ??
            new ChatTtsPlaybackError(null, null, { cause: error }),
        );
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
        else settle(new ChatTtsPlaybackError(code, signal));
      };
      const timer = setTimeout(onTimeout, validated.timeoutMs);
      validated.signal?.addEventListener("abort", onAbort, { once: true });
      child.once("error", onError);
      child.once("close", onClose);
      child.stderr?.on("data", onDiagnostic);
    });
  }
}

function validateApprovedWavPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !isAbsolute(value) ||
    containsControlCharacters(value) ||
    basename(value).toLowerCase() !== TEMPORARY_WAV_NAME ||
    !basename(dirname(value)).startsWith(TEMPORARY_DIRECTORY_PREFIX)
  ) {
    throw new ChatTtsPlaybackError();
  }
  return value;
}

function validatePlaybackOptions(options: unknown): {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
} {
  if (options === undefined) return { timeoutMs: DEFAULT_PLAYBACK_TIMEOUT_MS };
  if (!isPlainObject(options)) throw new ChatTtsPlaybackError();
  for (const key of Object.keys(options)) {
    if (key !== "signal" && key !== "timeoutMs") {
      throw new ChatTtsPlaybackError();
    }
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new ChatTtsPlaybackError();
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_PLAYBACK_TIMEOUT_MS;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_PLAYBACK_TIMEOUT_MS
  ) {
    throw new ChatTtsPlaybackError();
  }
  return options.signal === undefined
    ? { timeoutMs }
    : { signal: options.signal as AbortSignal, timeoutMs };
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

function causeOptions(cause: unknown): ErrorOptions | undefined {
  return cause === undefined ? undefined : { cause };
}

export const WINDOWS_WAV_PLAYBACK_SCRIPT = POWERSHELL_PLAYBACK_SCRIPT;
