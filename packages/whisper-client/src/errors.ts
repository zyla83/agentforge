export class WhisperError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WhisperError";
  }
}

export class WhisperConfigurationError extends WhisperError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(
      `Invalid whisper.cpp configuration: ${snapshot.join("; ")}.`,
      options,
    );
    this.name = "WhisperConfigurationError";
    this.details = snapshot;
  }
}

export class WhisperRequestError extends WhisperError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(
      `Invalid whisper.cpp transcription request: ${snapshot.join("; ")}.`,
      options,
    );
    this.name = "WhisperRequestError";
    this.details = snapshot;
  }
}

export class WhisperResourceError extends WhisperError {
  readonly resource: "executable" | "model" | "input" | "output";

  constructor(
    resource: "executable" | "model" | "input" | "output",
    options?: ErrorOptions,
  ) {
    super(
      `The configured whisper.cpp ${resource} resource is unavailable.`,
      options,
    );
    this.name = "WhisperResourceError";
    this.resource = resource;
  }
}

export class WhisperTransportError extends WhisperError {
  constructor(options?: ErrorOptions) {
    super("Unable to start or communicate with whisper.cpp.", options);
    this.name = "WhisperTransportError";
  }
}

export class WhisperAbortError extends WhisperError {
  constructor(options?: ErrorOptions) {
    super("whisper.cpp transcription was cancelled.", options);
    this.name = "WhisperAbortError";
  }
}

export class WhisperTimeoutError extends WhisperError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(
      `whisper.cpp transcription timed out after ${timeoutMs} ms.`,
      options,
    );
    this.name = "WhisperTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class WhisperProcessError extends WhisperError {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    options?: ErrorOptions,
  ) {
    super("whisper.cpp exited without completing transcription.", options);
    this.name = "WhisperProcessError";
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export type WhisperOutputErrorReason =
  | "missing"
  | "not-file"
  | "empty"
  | "control-only"
  | "invalid"
  | "oversized";

export class WhisperOutputError extends WhisperError {
  readonly reason: WhisperOutputErrorReason;

  constructor(reason: WhisperOutputErrorReason, options?: ErrorOptions) {
    super("whisper.cpp did not create a valid bounded transcript.", options);
    this.name = "WhisperOutputError";
    this.reason = reason;
  }
}
