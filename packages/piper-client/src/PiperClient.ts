import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, extname, isAbsolute } from "node:path";
import {
  PiperAbortError,
  PiperConfigurationError,
  PiperOutputError,
  PiperProcessError,
  PiperRequestError,
  PiperResourceError,
  PiperTimeoutError,
  PiperTransportError,
} from "./errors.js";
import type {
  PiperClientOptions,
  PiperSynthesisOptions,
  PiperSynthesisRequest,
  PiperSynthesisResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_TEXT_LENGTH = 16_000;
const MAX_DIAGNOSTIC_BYTES = 4_096;
const CONTROL_OR_WHITESPACE_ONLY_PATTERN = /^[\s\p{Cc}\p{Cf}]*$/u;
const OPTION_KEYS = new Set(["executable", "model", "config"]);
const REQUEST_KEYS = new Set(["text", "outputFile"]);
const SYNTHESIS_OPTION_KEYS = new Set(["signal", "timeoutMs"]);

export class PiperClient {
  private readonly executable: string;
  private readonly model: string;
  private readonly config: string | undefined;
  private readonly usedOutputFiles = new Set<string>();

  constructor(options: PiperClientOptions) {
    const validated = validateClientOptions(options);
    this.executable = validated.executable;
    this.model = validated.model;
    this.config = validated.config;
  }

  async synthesize(
    request: PiperSynthesisRequest,
    options?: PiperSynthesisOptions,
  ): Promise<Readonly<PiperSynthesisResult>> {
    const validatedRequest = await validateRequest(request);
    const validatedOptions = validateSynthesisOptions(options);
    if (validatedOptions.signal?.aborted) {
      throw new PiperAbortError(causeOptions(validatedOptions.signal.reason));
    }
    if (this.usedOutputFiles.has(validatedRequest.outputFile)) {
      throw new PiperRequestError([
        "request.outputFile: target was already used",
      ]);
    }
    this.usedOutputFiles.add(validatedRequest.outputFile);

    const args = ["--model", this.model];
    if (this.config !== undefined) args.push("--config", this.config);
    args.push("--output_file", validatedRequest.outputFile);

    await runPiperProcess(
      this.executable,
      args,
      validatedRequest.text,
      validatedOptions,
    );
    await validateWaveOutput(validatedRequest.outputFile);

    return Object.freeze({
      status: "created" as const,
      outputFile: validatedRequest.outputFile,
    });
  }
}

function validateClientOptions(options: unknown): {
  readonly executable: string;
  readonly model: string;
  readonly config?: string;
} {
  if (!isPlainObject(options)) {
    throw new PiperConfigurationError(["options: must be a plain object"]);
  }
  const details: string[] = [];
  rejectUnknown(options, OPTION_KEYS, "options", details);
  validateConfiguredPath(options.executable, "executable", undefined, details);
  validateConfiguredPath(options.model, "model", ".onnx", details);
  if (options.config !== undefined) {
    validateConfiguredPath(options.config, "config", ".onnx.json", details);
  }
  if (details.length > 0) throw new PiperConfigurationError(details);

  const executable = options.executable as string;
  const model = options.model as string;
  const config = options.config as string | undefined;
  assertRegularFile(executable, "executable");
  assertRegularFile(model, "model");
  if (config !== undefined) assertRegularFile(config, "config");
  return config === undefined
    ? { executable, model }
    : { executable, model, config };
}

function validateConfiguredPath(
  value: unknown,
  name: "executable" | "model" | "config",
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

function assertRegularFile(
  path: string,
  resource: "executable" | "model" | "config",
): void {
  try {
    if (!lstatSync(path).isFile()) throw new PiperResourceError(resource);
  } catch (error) {
    if (error instanceof PiperResourceError) throw error;
    throw new PiperResourceError(resource, { cause: error });
  }
}

async function validateRequest(request: unknown): Promise<{
  readonly text: string;
  readonly outputFile: string;
}> {
  if (!isPlainObject(request)) {
    throw new PiperRequestError(["request: must be a plain object"]);
  }
  const details: string[] = [];
  rejectUnknown(request, REQUEST_KEYS, "request", details);
  const text = request.text;
  if (typeof text !== "string") {
    details.push("request.text: must be a string");
  } else {
    if (text.length === 0 || CONTROL_OR_WHITESPACE_ONLY_PATTERN.test(text)) {
      details.push("request.text: must contain spoken content");
    }
    if (text.includes("\0")) {
      details.push("request.text: must not contain NUL characters");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      details.push(
        `request.text: must not exceed ${MAX_TEXT_LENGTH} code units`,
      );
    }
  }
  const outputFile = request.outputFile;
  if (typeof outputFile !== "string" || outputFile.length === 0) {
    details.push("request.outputFile: must be a non-empty string");
  } else {
    if (!isAbsolute(outputFile)) {
      details.push("request.outputFile: must be absolute");
    }
    if (containsControlCharacters(outputFile)) {
      details.push("request.outputFile: must not contain control characters");
    }
    if (extname(outputFile).toLowerCase() !== ".wav") {
      details.push("request.outputFile: must end in .wav");
    }
  }
  if (details.length > 0) throw new PiperRequestError(details);

  try {
    if (!(await lstat(dirname(outputFile as string))).isDirectory()) {
      throw new PiperRequestError([
        "request.outputFile: parent must be an existing directory",
      ]);
    }
  } catch (error) {
    if (error instanceof PiperRequestError) throw error;
    throw new PiperRequestError(
      ["request.outputFile: parent must be an existing directory"],
      { cause: error },
    );
  }
  try {
    await lstat(outputFile as string);
    throw new PiperRequestError([
      "request.outputFile: target must not already exist",
    ]);
  } catch (error) {
    if (error instanceof PiperRequestError) throw error;
    if (!isNotFoundError(error)) {
      throw new PiperRequestError(
        ["request.outputFile: target could not be inspected"],
        { cause: error },
      );
    }
  }
  return { text: text as string, outputFile: outputFile as string };
}

function validateSynthesisOptions(options: unknown): {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
} {
  if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS };
  if (!isPlainObject(options)) {
    throw new PiperRequestError(["options: must be a plain object"]);
  }
  const details: string[] = [];
  rejectUnknown(options, SYNTHESIS_OPTION_KEYS, "options", details);
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
  if (details.length > 0) throw new PiperRequestError(details);
  return options.signal === undefined
    ? { timeoutMs: timeoutMs as number }
    : { signal: options.signal as AbortSignal, timeoutMs: timeoutMs as number };
}

async function runPiperProcess(
  executable: string,
  args: readonly string[],
  text: string,
  options: { readonly signal?: AbortSignal; readonly timeoutMs: number },
): Promise<void> {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(executable, [...args], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      shell: false,
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new PiperTransportError({ cause: error });
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let terminationError: PiperAbortError | PiperTimeoutError | undefined;
    let diagnosticBytes = 0;
    const diagnosticChunks: Buffer[] = [];
    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      child.stdin?.removeListener("error", onStdinError);
      child.stderr?.removeListener("data", onDiagnostic);
    };
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      diagnosticChunks.length = 0;
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
      terminationError = new PiperAbortError(
        causeOptions(options.signal?.reason),
      );
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (!terminate()) settle(terminationError);
    };
    const onTimeout = (): void => {
      if (terminationError !== undefined) return;
      terminationError = new PiperTimeoutError(options.timeoutMs);
      options.signal?.removeEventListener("abort", onAbort);
      if (!terminate()) settle(terminationError);
    };
    const onError = (error: Error): void => {
      settle(terminationError ?? new PiperTransportError({ cause: error }));
    };
    const onStdinError = (error: Error): void => {
      terminate();
      settle(new PiperTransportError({ cause: error }));
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
      else settle(new PiperProcessError(code, signal));
    };
    const onDiagnostic = (chunk: Buffer | string): void => {
      if (diagnosticBytes >= MAX_DIAGNOSTIC_BYTES) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = MAX_DIAGNOSTIC_BYTES - diagnosticBytes;
      diagnosticChunks.push(buffer.subarray(0, remaining));
      diagnosticBytes += Math.min(buffer.length, remaining);
    };
    const timer = setTimeout(onTimeout, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", onError);
    child.once("close", onClose);
    child.stdin?.once("error", onStdinError);
    child.stderr?.on("data", onDiagnostic);
    if (child.stdin === null) {
      terminate();
      settle(new PiperTransportError());
      return;
    }
    try {
      child.stdin.end(text, "utf8");
    } catch (error) {
      terminate();
      settle(new PiperTransportError({ cause: error }));
    }
  });
}

async function validateWaveOutput(outputFile: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(outputFile);
  } catch (error) {
    throw new PiperOutputError("missing", { cause: error });
  }
  if (!stats.isFile()) throw new PiperOutputError("not-file");
  if (stats.size === 0) throw new PiperOutputError("empty");
  if (stats.size < 12) throw new PiperOutputError("invalid-wave");

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(outputFile, "r");
  } catch (error) {
    throw new PiperOutputError("invalid-wave", { cause: error });
  }

  let readError: unknown;
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (
      bytesRead !== 12 ||
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new PiperOutputError("invalid-wave");
    }
  } catch (error) {
    readError = error;
  }

  let closeError: unknown;
  try {
    await handle.close();
  } catch (error) {
    closeError = error;
  }

  if (readError instanceof PiperOutputError) throw readError;
  if (readError !== undefined) {
    throw new PiperOutputError("invalid-wave", { cause: readError });
  }
  if (closeError !== undefined) {
    throw new PiperOutputError("invalid-wave", { cause: closeError });
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
