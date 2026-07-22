export class PiperError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PiperError";
  }
}

export class PiperConfigurationError extends PiperError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(`Invalid Piper configuration: ${snapshot.join("; ")}.`, options);
    this.name = "PiperConfigurationError";
    this.details = snapshot;
  }
}

export class PiperRequestError extends PiperError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(`Invalid Piper synthesis request: ${snapshot.join("; ")}.`, options);
    this.name = "PiperRequestError";
    this.details = snapshot;
  }
}

export class PiperResourceError extends PiperError {
  readonly resource: "executable" | "model" | "config";

  constructor(
    resource: "executable" | "model" | "config",
    options?: ErrorOptions,
  ) {
    super(`The configured Piper ${resource} is unavailable.`, options);
    this.name = "PiperResourceError";
    this.resource = resource;
  }
}

export class PiperTransportError extends PiperError {
  constructor(options?: ErrorOptions) {
    super("Unable to start or communicate with Piper.", options);
    this.name = "PiperTransportError";
  }
}

export class PiperAbortError extends PiperError {
  constructor(options?: ErrorOptions) {
    super("Piper synthesis was cancelled.", options);
    this.name = "PiperAbortError";
  }
}

export class PiperTimeoutError extends PiperError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(`Piper synthesis timed out after ${timeoutMs} ms.`, options);
    this.name = "PiperTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class PiperProcessError extends PiperError {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    options?: ErrorOptions,
  ) {
    super("Piper exited without creating speech successfully.", options);
    this.name = "PiperProcessError";
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export class PiperOutputError extends PiperError {
  readonly reason: "missing" | "not-file" | "empty" | "invalid-wave";

  constructor(
    reason: "missing" | "not-file" | "empty" | "invalid-wave",
    options?: ErrorOptions,
  ) {
    super("Piper did not create a valid WAV output file.", options);
    this.name = "PiperOutputError";
    this.reason = reason;
  }
}
