export class ChatTtsError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChatTtsError";
  }
}

export class ChatTtsUnsupportedPlatformError extends ChatTtsError {
  constructor() {
    super("Piper speech playback is supported only on Windows.");
    this.name = "ChatTtsUnsupportedPlatformError";
  }
}

export class ChatTtsPlaybackError extends ChatTtsError {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    exitCode: number | null = null,
    signal: NodeJS.Signals | null = null,
    options?: ErrorOptions,
  ) {
    super("Windows WAV playback failed.", options);
    this.name = "ChatTtsPlaybackError";
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export class ChatTtsPlaybackAbortError extends ChatTtsError {
  constructor(options?: ErrorOptions) {
    super("Speech playback was cancelled.", options);
    this.name = "ChatTtsPlaybackAbortError";
  }
}

export class ChatTtsPlaybackTimeoutError extends ChatTtsError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Speech playback timed out after ${timeoutMs} ms.`);
    this.name = "ChatTtsPlaybackTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ChatTtsCleanupError extends ChatTtsError {
  constructor(options?: ErrorOptions) {
    super("Temporary speech audio cleanup failed.", options);
    this.name = "ChatTtsCleanupError";
  }
}
