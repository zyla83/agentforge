import { ProviderAbortError, ProviderRequestError } from "./errors/index.js";

export interface ProviderRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export function validateProviderRequestOptions(
  options?: ProviderRequestOptions,
): void {
  const timeoutMs: unknown = options?.timeoutMs;

  if (timeoutMs === undefined) {
    return;
  }

  if (
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new ProviderRequestError(
      "<unknown>",
      "Provider request timeoutMs must be a positive finite integer.",
    );
  }
}

export function throwIfProviderRequestAborted(
  providerName: string,
  options?: ProviderRequestOptions,
): void {
  const signal = options?.signal;

  if (!signal?.aborted) {
    return;
  }

  if (signal.reason !== undefined) {
    throw new ProviderAbortError(providerName, { cause: signal.reason });
  }

  throw new ProviderAbortError(providerName);
}
