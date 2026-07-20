import {
  SpotifyAbortError,
  SpotifyAuthenticationError,
  SpotifyHttpError,
  SpotifyRateLimitError,
  SpotifyRequestError,
  SpotifyResponseError,
  SpotifyTransportError,
} from "./errors.js";
import {
  createOperationSignal,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  validateTimeout,
} from "./internal.js";
import type {
  SpotifyAccessTokenSource,
  SpotifyCurrentPlayback,
  SpotifyFetch,
  SpotifyPlaybackDevice,
  SpotifyPlaybackItem,
  SpotifyRequestOptions,
} from "./types.js";

const DEFAULT_API_BASE_URL = "https://api.spotify.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const CURRENT_PLAYBACK_ENDPOINT = "/v1/me/player";

export interface SpotifyClientOptions {
  readonly accessTokenSource: SpotifyAccessTokenSource;
  readonly fetch?: SpotifyFetch;
  readonly apiBaseUrl?: string;
  readonly defaultTimeoutMs?: number;
}

export class SpotifyClient {
  private readonly accessTokenSource: SpotifyAccessTokenSource;
  private readonly fetchImplementation: SpotifyFetch;
  private readonly apiBaseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: SpotifyClientOptions) {
    if (!isRecord(options))
      throw new SpotifyRequestError(["options: must be an object"]);
    if (
      !isRecord(options.accessTokenSource) ||
      typeof options.accessTokenSource.getAccessToken !== "function"
    ) {
      throw new SpotifyRequestError([
        "options.accessTokenSource: must provide getAccessToken",
      ]);
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function")
      throw new SpotifyRequestError(["options.fetch: must be a function"]);
    this.accessTokenSource = options.accessTokenSource;
    this.fetchImplementation = fetchImplementation as SpotifyFetch;
    this.apiBaseUrl = validateApiBaseUrl(
      options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    );
    this.defaultTimeoutMs = validateTimeout(
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "options.defaultTimeoutMs",
    );
  }

  async getCurrentPlayback(
    options: SpotifyRequestOptions = {},
  ): Promise<SpotifyCurrentPlayback> {
    const request = validateRequestOptions(options, this.defaultTimeoutMs);
    const operation = "get-current-playback";
    if (request.signal?.aborted) {
      throw new SpotifyAbortError(
        operation,
        request.signal.reason === undefined
          ? undefined
          : { cause: request.signal.reason },
      );
    }
    const accessToken = await this.accessTokenSource.getAccessToken(request);
    if (!isNonEmptyString(accessToken)) {
      throw new SpotifyAuthenticationError(
        "Spotify access-token source returned an invalid token.",
      );
    }
    const combined = createOperationSignal(
      operation,
      request.signal,
      request.timeoutMs,
    );
    const endpointUrl = new URL(
      CURRENT_PLAYBACK_ENDPOINT,
      `${this.apiBaseUrl}/`,
    ).toString();
    try {
      const response = await this.fetchImplementation(endpointUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: combined.signal,
      });
      if (request.signal?.aborted) combined.classify(request.signal.reason);
      if (response.status === 204) return Object.freeze({ status: "idle" });
      if (response.status === 401) {
        throw new SpotifyAuthenticationError(
          "Spotify authentication was rejected. Reauthorization may be required.",
          undefined,
          401,
        );
      }
      if (response.status === 429) {
        throw new SpotifyRateLimitError(
          CURRENT_PLAYBACK_ENDPOINT,
          parseRetryAfter(response.headers.get("Retry-After")),
        );
      }
      if (!response.ok)
        throw new SpotifyHttpError(CURRENT_PLAYBACK_ENDPOINT, response.status);
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new SpotifyResponseError(
          CURRENT_PLAYBACK_ENDPOINT,
          ["body: must be valid JSON"],
          { cause: error },
        );
      }
      if (request.signal?.aborted) combined.classify(request.signal.reason);
      return parsePlayback(body);
    } catch (error) {
      if (
        error instanceof SpotifyAuthenticationError ||
        error instanceof SpotifyHttpError ||
        error instanceof SpotifyResponseError
      )
        throw error;
      try {
        combined.classify(error);
      } catch (classified) {
        if (classified !== error) throw classified;
      }
      throw new SpotifyTransportError(operation);
    } finally {
      combined.cleanup();
    }
  }
}

function validateApiBaseUrl(value: unknown): string {
  if (!isNonEmptyString(value))
    throw new SpotifyRequestError([
      "options.apiBaseUrl: must be a non-empty HTTPS URL",
    ]);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SpotifyRequestError([
      "options.apiBaseUrl: must be an absolute HTTPS URL",
    ]);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new SpotifyRequestError([
      "options.apiBaseUrl: must be a credential-free HTTPS URL without query or fragment",
    ]);
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function validateRequestOptions(
  options: SpotifyRequestOptions,
  fallback: number,
): { readonly signal?: AbortSignal; readonly timeoutMs: number } {
  if (!isRecord(options))
    throw new SpotifyRequestError(["request options: must be an object"]);
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new SpotifyRequestError([
      "request options.signal: must be an AbortSignal",
    ]);
  }
  return Object.freeze({
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    timeoutMs: validateTimeout(
      options.timeoutMs ?? fallback,
      "request options.timeoutMs",
    ),
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/u.test(value)) return undefined;
  const seconds = Number(value);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > Number.MAX_SAFE_INTEGER / 1000
  )
    return undefined;
  return seconds * 1000;
}

function parsePlayback(value: unknown): SpotifyCurrentPlayback {
  const details: string[] = [];
  if (!isRecord(value))
    throw new SpotifyResponseError(CURRENT_PLAYBACK_ENDPOINT, [
      "body: must be an object",
    ]);
  const isPlaying = readBoolean(value.is_playing, "body.is_playing", details);
  const progressMs = readNullableInteger(
    value.progress_ms,
    "body.progress_ms",
    details,
    0,
  );
  const device = parseDevice(value.device, details);
  const item = parseItem(value.item, details);
  if (details.length > 0 || isPlaying === undefined)
    throw new SpotifyResponseError(CURRENT_PLAYBACK_ENDPOINT, details);
  const snapshot: {
    status: "playing" | "paused";
    progressMs?: number;
    device?: Readonly<SpotifyPlaybackDevice>;
    item?: Readonly<SpotifyPlaybackItem>;
  } = {
    status: isPlaying ? "playing" : "paused",
  };
  if (progressMs !== undefined) snapshot.progressMs = progressMs;
  if (device !== undefined) snapshot.device = device;
  if (item !== undefined) snapshot.item = item;
  return deepFreeze(snapshot);
}

function parseDevice(
  value: unknown,
  details: string[],
): Readonly<SpotifyPlaybackDevice> | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) {
    details.push("body.device: must be an object or null");
    return undefined;
  }
  const name = readNonEmpty(value.name, "body.device.name", details);
  const type = readNonEmpty(value.type, "body.device.type", details);
  const isActive = readBoolean(
    value.is_active,
    "body.device.is_active",
    details,
  );
  const id = readNullableString(value.id, "body.device.id", details);
  const volumePercent = readNullableInteger(
    value.volume_percent,
    "body.device.volume_percent",
    details,
    0,
    100,
  );
  if (name === undefined || type === undefined || isActive === undefined)
    return undefined;
  return Object.freeze({
    name,
    type,
    isActive,
    ...(id === undefined ? {} : { id }),
    ...(volumePercent === undefined ? {} : { volumePercent }),
  });
}

function parseItem(
  value: unknown,
  details: string[],
): Readonly<SpotifyPlaybackItem> | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) {
    details.push("body.item: must be an object or null");
    return undefined;
  }
  const rawType = readNonEmpty(value.type, "body.item.type", details);
  const name = readNonEmpty(value.name, "body.item.name", details);
  const uri = readNullableString(value.uri, "body.item.uri", details);
  const durationMs = readNullableInteger(
    value.duration_ms,
    "body.item.duration_ms",
    details,
    0,
  );
  let artists: readonly string[] | undefined;
  if (rawType === "track" && value.artists !== undefined) {
    if (!Array.isArray(value.artists))
      details.push("body.item.artists: must be an array");
    else {
      const names: string[] = [];
      value.artists.forEach((artist, index) => {
        if (!isRecord(artist) || !isNonEmptyString(artist.name))
          details.push(
            `body.item.artists[${index}].name: must be a non-empty string`,
          );
        else names.push(artist.name);
      });
      artists = Object.freeze(names);
    }
  }
  if (rawType === undefined || name === undefined) return undefined;
  const type =
    rawType === "track" || rawType === "episode" ? rawType : "unknown";
  return Object.freeze({
    type,
    name,
    ...(uri === undefined ? {} : { uri }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(artists === undefined ? {} : { artists }),
  });
}

function readBoolean(
  value: unknown,
  path: string,
  details: string[],
): boolean | undefined {
  if (typeof value === "boolean") return value;
  details.push(`${path}: must be a boolean`);
  return undefined;
}

function readNonEmpty(
  value: unknown,
  path: string,
  details: string[],
): string | undefined {
  if (isNonEmptyString(value)) return value;
  details.push(`${path}: must be a non-empty string`);
  return undefined;
}

function readNullableString(
  value: unknown,
  path: string,
  details: string[],
): string | undefined {
  if (value === null || value === undefined) return undefined;
  return readNonEmpty(value, path, details);
}

function readNullableInteger(
  value: unknown,
  path: string,
  details: string[],
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
    return value;
  details.push(`${path}: must be an integer between ${minimum} and ${maximum}`);
  return undefined;
}
