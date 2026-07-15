export interface CombinedAbortSignal {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
}

export function createCombinedAbortSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): CombinedAbortSignal {
  const controller = new AbortController();
  let timedOut = false;

  const handleCallerAbort = (): void => {
    controller.abort(callerSignal?.reason);
  };

  callerSignal?.addEventListener("abort", handleCallerAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException("The request timed out.", "TimeoutError"),
    );
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", handleCallerAbort);
    },
  };
}
