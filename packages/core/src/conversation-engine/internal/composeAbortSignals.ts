export interface ComposedAbortSignal {
  readonly signal: AbortSignal | undefined;
  dispose(): void;
}

export function composeAbortSignals(
  signals: readonly (AbortSignal | undefined)[],
): ComposedAbortSignal {
  const sources = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  if (sources.length === 0) {
    return Object.freeze({ signal: undefined, dispose() {} });
  }
  if (sources.length === 1) {
    return Object.freeze({ signal: sources[0], dispose() {} });
  }

  const controller = new AbortController();
  let disposed = false;
  const listeners: Array<{
    readonly signal: AbortSignal;
    readonly listener: () => void;
  }> = [];

  for (const signal of sources) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
  }

  if (!controller.signal.aborted) {
    for (const signal of sources) {
      const listener = () => {
        if (!controller.signal.aborted) controller.abort(signal.reason);
      };
      signal.addEventListener("abort", listener, { once: true });
      listeners.push({ signal, listener });
    }
  }

  return Object.freeze({
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { signal, listener } of listeners) {
        signal.removeEventListener("abort", listener);
      }
      listeners.length = 0;
    },
  });
}
