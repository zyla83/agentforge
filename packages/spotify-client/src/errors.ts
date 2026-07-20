export class SpotifyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SpotifyError";
  }
}

export class SpotifyRequestError extends SpotifyError {
  readonly details: readonly string[];

  constructor(details: readonly string[]) {
    const snapshot = Object.freeze([...details]);
    super(`Invalid Spotify request: ${snapshot.join("; ")}.`);
    this.name = "SpotifyRequestError";
    this.details = snapshot;
  }
}

export class SpotifyAbortError extends SpotifyError {
  readonly operation: string;

  constructor(operation: string, options?: ErrorOptions) {
    super(`Spotify operation "${operation}" was aborted.`, options);
    this.name = "SpotifyAbortError";
    this.operation = operation;
  }
}

export class SpotifyTimeoutError extends SpotifyError {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number, options?: ErrorOptions) {
    super(
      `Spotify operation "${operation}" timed out after ${timeoutMs} ms.`,
      options,
    );
    this.name = "SpotifyTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class SpotifyTransportError extends SpotifyError {
  readonly operation: string;

  constructor(operation: string, options?: ErrorOptions) {
    super(`Unable to complete Spotify operation "${operation}".`, options);
    this.name = "SpotifyTransportError";
    this.operation = operation;
  }
}

export class SpotifyAuthenticationError extends SpotifyError {
  readonly status?: number;

  constructor(
    message = "Spotify authentication failed.",
    options?: ErrorOptions,
    status?: number,
  ) {
    super(message, options);
    this.name = "SpotifyAuthenticationError";
    if (status !== undefined) this.status = status;
  }
}

export class SpotifyHttpError extends SpotifyError {
  readonly endpoint: string;
  readonly status: number;

  constructor(endpoint: string, status: number, options?: ErrorOptions) {
    const detail =
      status === 403
        ? " The account, scope, or API policy may not permit this request."
        : "";
    super(
      `Spotify request to "${endpoint}" failed with HTTP ${status}.${detail}`,
      options,
    );
    this.name = "SpotifyHttpError";
    this.endpoint = endpoint;
    this.status = status;
  }
}

export class SpotifyRateLimitError extends SpotifyHttpError {
  readonly retryAfterMs?: number;

  constructor(endpoint: string, retryAfterMs?: number) {
    super(endpoint, 429);
    this.name = "SpotifyRateLimitError";
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export class SpotifyResponseError extends SpotifyError {
  readonly endpoint: string;
  readonly details: readonly string[];

  constructor(
    endpoint: string,
    details: readonly string[],
    options?: ErrorOptions,
  ) {
    const snapshot = Object.freeze([...details]);
    super(
      `Invalid Spotify response from "${endpoint}": ${snapshot.join("; ")}.`,
      options,
    );
    this.name = "SpotifyResponseError";
    this.endpoint = endpoint;
    this.details = snapshot;
  }
}

export class SpotifyCredentialStoreError extends SpotifyError {
  readonly operation: string;

  constructor(operation: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SpotifyCredentialStoreError";
    this.operation = operation;
  }
}

export class SpotifyCredentialStoreInitializationError extends SpotifyCredentialStoreError {
  constructor(options?: ErrorOptions) {
    super(
      "initialize",
      "Spotify credential store initialization failed.",
      options,
    );
    this.name = "SpotifyCredentialStoreInitializationError";
  }
}

export class SpotifyCredentialStoreCorruptionError extends SpotifyCredentialStoreError {
  readonly details: readonly string[];

  constructor(details: readonly string[], options?: ErrorOptions) {
    const snapshot = Object.freeze([...details]);
    super(
      "load",
      `Spotify credential document is invalid: ${snapshot.join("; ")}.`,
      options,
    );
    this.name = "SpotifyCredentialStoreCorruptionError";
    this.details = snapshot;
  }
}

export class SpotifyCredentialStoreIoError extends SpotifyCredentialStoreError {
  constructor(operation: "load" | "save", options?: ErrorOptions) {
    super(operation, `Spotify credential store ${operation} failed.`, options);
    this.name = "SpotifyCredentialStoreIoError";
  }
}
