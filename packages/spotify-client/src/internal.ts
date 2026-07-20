import {
  SpotifyAbortError,
  SpotifyRequestError,
  SpotifyTimeoutError,
} from "./errors.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateTimeout(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new SpotifyRequestError([
      `${path}: must be a positive finite integer`,
    ]);
  }
  return value;
}

export function createOperationSignal(
  operation: string,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  readonly signal: AbortSignal;
  readonly classify: (error: unknown) => never;
  readonly cleanup: () => void;
} {
  if (callerSignal?.aborted) {
    throw new SpotifyAbortError(operation, causeOptions(callerSignal.reason));
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Timed out", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    classify(error: unknown): never {
      if (callerSignal?.aborted)
        throw new SpotifyAbortError(
          operation,
          causeOptions(callerSignal.reason),
        );
      if (timedOut)
        throw new SpotifyTimeoutError(operation, timeoutMs, { cause: error });
      throw error;
    },
    cleanup(): void {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    },
  };
}

export function causeOptions(cause: unknown): ErrorOptions | undefined {
  return cause === undefined ? undefined : { cause };
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  details: string[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) details.push(`${path}.${key}: unknown property`);
}
