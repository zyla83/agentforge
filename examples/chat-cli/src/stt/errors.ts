export class ChatSttError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChatSttError";
  }
}

export class ChatSttConfigurationError extends ChatSttError {
  constructor(options?: ErrorOptions) {
    super("Local microphone input is not configured correctly.", options);
    this.name = "ChatSttConfigurationError";
  }
}

export class ChatSttUnsupportedPlatformError extends ChatSttError {
  constructor() {
    super("Local microphone input is supported only on Windows.");
    this.name = "ChatSttUnsupportedPlatformError";
  }
}

export class ChatSttRecordingError extends ChatSttError {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    exitCode: number | null = null,
    signal: NodeJS.Signals | null = null,
    options?: ErrorOptions,
  ) {
    super("Microphone recording failed.", options);
    this.name = "ChatSttRecordingError";
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export class ChatSttRecordingAbortError extends ChatSttError {
  constructor(options?: ErrorOptions) {
    super("Microphone recording was cancelled.", options);
    this.name = "ChatSttRecordingAbortError";
  }
}

export class ChatSttRecordingTimeoutError extends ChatSttError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Microphone recording timed out after ${timeoutMs} ms.`);
    this.name = "ChatSttRecordingTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ChatSttOutputError extends ChatSttError {
  readonly reason: "missing" | "not-file" | "empty" | "invalid-wave";

  constructor(
    reason: "missing" | "not-file" | "empty" | "invalid-wave",
    options?: ErrorOptions,
  ) {
    super("Microphone recording did not create a valid WAV file.", options);
    this.name = "ChatSttOutputError";
    this.reason = reason;
  }
}

export class ChatSttCleanupError extends ChatSttError {
  constructor(options?: ErrorOptions) {
    super("Temporary microphone input cleanup failed.", options);
    this.name = "ChatSttCleanupError";
  }
}
