import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute } from "node:path";
import {
  WhisperAbortError,
  WhisperConfigurationError,
  WhisperOutputError,
  WhisperProcessError,
  WhisperRequestError,
  WhisperResourceError,
  WhisperTimeoutError,
  WhisperTransportError,
} from "./errors.js";
import type {
  WhisperClientOptions,
  WhisperTranscriptionOptions,
  WhisperTranscriptionRequest,
  WhisperTranscriptionResult,
} from "./types.js";

const DEFAULT_LANGUAGE = "auto";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_LANGUAGE_LENGTH = 32;
const MAX_TRANSCRIPT_BYTES = 65_536;
const MAX_DIAGNOSTIC_BYTES = 4_096;
const LANGUAGE_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CONTROL_OR_WHITESPACE_ONLY_PATTERN = /^[\s\p{Cc}\p{Cf}]*$/u;
const OPTION_KEYS = new Set(["executable", "model", "language"]);
const REQUEST_KEYS = new Set(["inputFile", "outputPrefix"]);
const TRANSCRIPTION_OPTION_KEYS = new Set(["signal", "timeoutMs"]);

export class WhisperClient {
  private readonly executable: string;
  private readonly model: string;
  private readonly language: string;
  private readonly usedOutputPrefixes = new Set<string>();

  constructor(options: WhisperClientOptions) {
    const validated = validateClientOptions(options);
    this.executable = validated.executable;
    this.model = validated.model;
    this.language = validated.language;
  }

  async transcribe(
    request: WhisperTranscriptionRequest,
    options?: WhisperTranscriptionOptions,
  ): Promise<Readonly<WhisperTranscriptionResult>> {
    const validatedRequest = await validateRequest(request);
    const validatedOptions = validateTranscriptionOptions(options);
    if (validatedOptions.signal?.aborted) {
      throw new WhisperAbortError(causeOptions(validatedOptions.signal.reason));
    }
    if (this.usedOutputPrefixes.has(validatedRequest.outputPrefix)) {
      throw new WhisperRequestError([
        "request.outputPrefix: target was already used",
      ]);
    }
    this.usedOutputPrefixes.add(validatedRequest.outputPrefix);

    const args = [
      "-m",
      this.model,
      "-f",
      validatedRequest.inputFile,
      "-l",
      this.language,
      "-otxt",
      "-of",
      validatedRequest.outputPrefix,
      "-np",
      "-nt",
    ];
    await runWhisperProcess(this.executable, args, validatedOptions);
    const text = await readTranscript(`${validatedRequest.outputPrefix}.txt`);
    return Object.freeze({ status: "transcribed" as const, text });
  }
}

function validateClientOptions(options: unknown): {
  readonly executable: string;
  readonly model: string;
  readonly language: string;
} {
  if (!isPlainObject(options)) {
    throw new WhisperConfigurationError(["options: must be a plain object"]);
  }
  const details: string[] = [];
  rejectUnknown(options, OPTION_KEYS, "options", details);
  validateConfiguredPath(options.executable, "executable", undefined, details);
  validateConfiguredPath(options.model, "model", ".bin", details);
  const language = options.language ?? DEFAULT_LANGUAGE;
  validateLanguage(language, details);
  if (details.length > 0) throw new WhisperConfigurationError(details);

  const executable = options.executable as string;
  const model = options.model as string;
  assertRegularFile(executable, "executable");
  assertRegularFile(model, "model");
  return { executable, model, language: language as string };
}

function validateConfiguredPath(
  value: unknown,
  name: "executable" | "model",
  requiredSuffix: string | undefined,
  details: string[],
): void {
  if (typeof value !== "string" || value.length === 0) {
    details.push(`options.${name}: must be a non-empty string`);
    return;
  }
  if (!isAbsolute(value)) details.push(`options.${name}: must be absolute`);
  if (containsControlCharacters(value)) {
    details.push(`options.${name}: must not contain control characters`);
  }
  if (
    requiredSuffix !== undefined &&
    !value.toLowerCase().endsWith(requiredSuffix)
  ) {
    details.push(`options.${name}: must end in ${requiredSuffix}`);
  }
}

function validateLanguage(value: unknown, details: string[]): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_LANGUAGE_LENGTH ||
    value.trim() !== value ||
    !LANGUAGE_PATTERN.test(value)
  ) {
    details.push(
      `options.language: must be a 1-${MAX_LANGUAGE_LENGTH} character ASCII language token`,
    );
  }
}

function assertRegularFile(
  path: string,
  resource: "executable" | "model",
): void {
  try {
    if (!lstatSync(path).isFile()) throw new WhisperResourceError(resource);
  } catch (error) {
    if (error instanceof WhisperResourceError) throw error;
    throw new WhisperResourceError(resource, { cause: error });
  }
}

async function validateRequest(request: unknown): Promise<{
  readonly inputFile: string;
  readonly outputPrefix: string;
}> {
  if (!isPlainObject(request)) {
    throw new WhisperRequestError(["request: must be a plain object"]);
  }
  const details: string[] = [];
  rejectUnknown(request, REQUEST_KEYS, "request", details);
  validateRequestPath(request.inputFile, "inputFile", ".wav", details);
  validateRequestPath(request.outputPrefix, "outputPrefix", undefined, details);
  if (details.length > 0) throw new WhisperRequestError(details);

  const inputFile = request.inputFile as string;
  const outputPrefix = request.outputPrefix as string;
  try {
    if (!(await lstat(inputFile)).isFile()) {
      throw new WhisperResourceError("input");
    }
  } catch (error) {
    if (error instanceof WhisperResourceError) throw error;
    throw new WhisperResourceError("input", { cause: error });
  }
  try {
    if (!(await lstat(dirname(outputPrefix))).isDirectory()) {
      throw new WhisperRequestError([
        "request.outputPrefix: parent must be an existing directory",
      ]);
    }
  } catch (error) {
    if (error instanceof WhisperRequestError) throw error;
    throw new WhisperRequestError(
      ["request.outputPrefix: parent must be an existing directory"],
      { cause: error },
    );
  }
  await assertFreshPath(
    outputPrefix,
    "request.outputPrefix: target must not already exist",
  );
  await assertFreshPath(
    `${outputPrefix}.txt`,
    "request.outputPrefix: transcript target must not already exist",
  );
  return { inputFile, outputPrefix };
}

function validateRequestPath(
  value: unknown,
  name: "inputFile" | "outputPrefix",
  requiredSuffix: string | undefined,
  details: string[],
): void {
  if (typeof value !== "string" || value.length === 0) {
    details.push(`request.${name}: must be a non-empty string`);
    return;
  }
  if (!isAbsolute(value)) details.push(`request.${name}: must be absolute`);
  if (containsControlCharacters(value)) {
    details.push(`request.${name}: must not contain control characters`);
  }
  if (
    requiredSuffix !== undefined &&
    extname(value).toLowerCase() !== requiredSuffix
  ) {
    details.push(`request.${name}: must end in ${requiredSuffix}`);
  }
}

async function assertFreshPath(path: string, detail: string): Promise<void> {
  try {
    await lstat(path);
    throw new WhisperRequestError([detail]);
  } catch (error) {
    if (error instanceof WhisperRequestError) throw error;
    if (!isNotFoundError(error)) {
      throw new WhisperRequestError(
        ["request.outputPrefix: target could not be inspected"],
        {
          cause: error,
        },
      );
    }
  }
}

function validateTranscriptionOptions(options: unknown): {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
} {
  if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS };
  if (!isPlainObject(options)) {
    throw new WhisperRequestError(["options: must be a plain object"]);
  }
  const details: string[] = [];
  rejectUnknown(options, TRANSCRIPTION_OPTION_KEYS, "options", details);
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    details.push("options.signal: must be an AbortSignal");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    details.push(
      `options.timeoutMs: must be an integer from 1 to ${MAX_TIMEOUT_MS}`,
    );
  }
  if (details.length > 0) throw new WhisperRequestError(details);
  return options.signal === undefined
    ? { timeoutMs: timeoutMs as number }
    : { signal: options.signal as AbortSignal, timeoutMs: timeoutMs as number };
}

async function runWhisperProcess(
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
    throw new WhisperTransportError({ cause: error });
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let terminationError: WhisperAbortError | WhisperTimeoutError | undefined;
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
      terminationError = new WhisperAbortError(
        causeOptions(options.signal?.reason),
      );
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      terminate();
    };
    const onTimeout = (): void => {
      if (terminationError !== undefined) return;
      terminationError = new WhisperTimeoutError(options.timeoutMs);
      options.signal?.removeEventListener("abort", onAbort);
      terminate();
    };
    const onError = (error: Error): void => {
      if (terminationError === undefined) {
        settle(new WhisperTransportError({ cause: error }));
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
      else settle(new WhisperProcessError(code, signal));
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

async function readTranscript(outputFile: string): Promise<string> {
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(outputFile);
  } catch (error) {
    throw new WhisperOutputError("missing", { cause: error });
  }
  if (!stats.isFile()) throw new WhisperOutputError("not-file");
  if (stats.size === 0) throw new WhisperOutputError("empty");
  if (stats.size > MAX_TRANSCRIPT_BYTES) {
    throw new WhisperOutputError("oversized");
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(outputFile);
  } catch (error) {
    throw new WhisperOutputError("invalid", { cause: error });
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new WhisperOutputError("invalid", { cause: error });
  }
  if (decoded.includes("\0")) throw new WhisperOutputError("invalid");
  if (containsUnsafeTranscriptControls(decoded)) {
    throw new WhisperOutputError("invalid");
  }
  if (CONTROL_OR_WHITESPACE_ONLY_PATTERN.test(decoded)) {
    throw new WhisperOutputError("control-only");
  }
  const text = decoded.trim();
  if (text.length === 0) throw new WhisperOutputError("empty");
  return text;
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

function containsUnsafeTranscriptControls(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      (codePoint <= 0x1f &&
        codePoint !== 0x09 &&
        codePoint !== 0x0a &&
        codePoint !== 0x0d) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    );
  });
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  details: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) details.push(`${path}.${key}: unknown property`);
  }
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
