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
  rejectUnknown,
  validateTimeout,
} from "./internal.js";
import type {
  SpotifyAccessTokenSource,
  SpotifyAvailableDevice,
  SpotifyAvailableDevices,
  SpotifyCurrentPlayback,
  SpotifyFetch,
  SpotifyPlaybackDevice,
  SpotifyPlaybackItem,
  SpotifyPlaylistSearchItem,
  SpotifyPlaylistSearchResult,
  SpotifyRequestOptions,
  SpotifySearchRequestOptions,
  SpotifyStartPlaybackRequest,
  SpotifyStartPlaybackResult,
  SpotifyTrackSearchItem,
  SpotifyTrackSearchResult,
} from "./types.js";

const DEFAULT_API_BASE_URL = "https://api.spotify.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const CURRENT_PLAYBACK_ENDPOINT = "/v1/me/player";
const SEARCH_ENDPOINT = "/v1/search";
const DEVICES_ENDPOINT = "/v1/me/player/devices";
const START_PLAYBACK_ENDPOINT = "/v1/me/player/play";
const DEFAULT_SEARCH_LIMIT = 5;
const MAXIMUM_SEARCH_LIMIT = 10;
const MAXIMUM_SEARCH_QUERY_LENGTH = 200;
const MAXIMUM_SPOTIFY_URI_LENGTH = 256;
const MAXIMUM_DEVICE_ID_LENGTH = 256;
const START_PLAYBACK_PROPERTIES = new Set(["uri", "deviceId"]);

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

  async searchTracks(
    query: string,
    options: SpotifySearchRequestOptions = {},
  ): Promise<SpotifyTrackSearchResult> {
    const request = validateSearchRequest(
      query,
      options,
      this.defaultTimeoutMs,
    );
    const body = await this.search("track", "search-tracks", request);
    return parseTrackSearch(body, request.query);
  }

  async searchPlaylists(
    query: string,
    options: SpotifySearchRequestOptions = {},
  ): Promise<SpotifyPlaylistSearchResult> {
    const request = validateSearchRequest(
      query,
      options,
      this.defaultTimeoutMs,
    );
    const body = await this.search("playlist", "search-playlists", request);
    return parsePlaylistSearch(body, request.query);
  }

  async getAvailableDevices(
    options: SpotifyRequestOptions = {},
  ): Promise<SpotifyAvailableDevices> {
    const request = validateRequestOptions(options, this.defaultTimeoutMs);
    const operation = "get-available-devices";
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
      DEVICES_ENDPOINT,
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
      if (response.status === 401) {
        throw new SpotifyAuthenticationError(
          "Spotify authentication was rejected. Reauthorization may be required.",
          undefined,
          401,
        );
      }
      if (response.status === 429) {
        throw new SpotifyRateLimitError(
          DEVICES_ENDPOINT,
          parseRetryAfter(response.headers.get("Retry-After")),
        );
      }
      if (!response.ok)
        throw new SpotifyHttpError(DEVICES_ENDPOINT, response.status);
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        try {
          combined.classify(error);
        } catch (classified) {
          if (classified !== error) throw classified;
        }
        throw new SpotifyResponseError(
          DEVICES_ENDPOINT,
          ["body: must be valid JSON"],
          { cause: error },
        );
      }
      if (request.signal?.aborted) combined.classify(request.signal.reason);
      return parseAvailableDevices(body);
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

  async startPlayback(
    request: SpotifyStartPlaybackRequest,
    options: SpotifyRequestOptions = {},
  ): Promise<SpotifyStartPlaybackResult> {
    const playback = validateStartPlaybackRequest(request);
    const requestOptions = validateRequestOptions(
      options,
      this.defaultTimeoutMs,
    );
    const operation = "start-playback";
    if (requestOptions.signal?.aborted) {
      throw new SpotifyAbortError(
        operation,
        requestOptions.signal.reason === undefined
          ? undefined
          : { cause: requestOptions.signal.reason },
      );
    }
    const accessToken =
      await this.accessTokenSource.getAccessToken(requestOptions);
    if (!isNonEmptyString(accessToken)) {
      throw new SpotifyAuthenticationError(
        "Spotify access-token source returned an invalid token.",
      );
    }
    const combined = createOperationSignal(
      operation,
      requestOptions.signal,
      requestOptions.timeoutMs,
    );
    const endpointUrl = new URL(START_PLAYBACK_ENDPOINT, `${this.apiBaseUrl}/`);
    if (playback.deviceId !== undefined)
      endpointUrl.searchParams.set("device_id", playback.deviceId);
    const body =
      playback.itemType === "track"
        ? { uris: [playback.uri] }
        : { context_uri: playback.uri };
    try {
      const response = await this.fetchImplementation(endpointUrl, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: combined.signal,
      });
      if (requestOptions.signal?.aborted)
        combined.classify(requestOptions.signal.reason);
      if (response.status === 401) {
        throw new SpotifyAuthenticationError(
          "Spotify authentication was rejected. Reauthorization may be required.",
          undefined,
          401,
        );
      }
      if (response.status === 429) {
        throw new SpotifyRateLimitError(
          START_PLAYBACK_ENDPOINT,
          parseRetryAfter(response.headers.get("Retry-After")),
        );
      }
      if (!response.ok)
        throw new SpotifyHttpError(START_PLAYBACK_ENDPOINT, response.status);
      if (response.status !== 204) {
        throw new SpotifyResponseError(START_PLAYBACK_ENDPOINT, [
          "status: must be 204",
        ]);
      }
      return deepFreeze({
        status: "accepted" as const,
        itemType: playback.itemType,
        uri: playback.uri,
        ...(playback.deviceId === undefined
          ? {}
          : { deviceId: playback.deviceId }),
      });
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

  private async search(
    type: "track" | "playlist",
    operation: string,
    request: ValidatedSearchRequest,
  ): Promise<unknown> {
    if (request.signal?.aborted) {
      throw new SpotifyAbortError(
        operation,
        request.signal.reason === undefined
          ? undefined
          : { cause: request.signal.reason },
      );
    }
    const accessToken = await this.accessTokenSource.getAccessToken({
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      timeoutMs: request.timeoutMs,
    });
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
    const endpointUrl = new URL(SEARCH_ENDPOINT, `${this.apiBaseUrl}/`);
    endpointUrl.searchParams.set("q", request.query);
    endpointUrl.searchParams.set("type", type);
    endpointUrl.searchParams.set("limit", String(request.limit));
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
      if (response.status === 401) {
        throw new SpotifyAuthenticationError(
          "Spotify authentication was rejected. Reauthorization may be required.",
          undefined,
          401,
        );
      }
      if (response.status === 429) {
        throw new SpotifyRateLimitError(
          SEARCH_ENDPOINT,
          parseRetryAfter(response.headers.get("Retry-After")),
        );
      }
      if (!response.ok)
        throw new SpotifyHttpError(SEARCH_ENDPOINT, response.status);
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        try {
          combined.classify(error);
        } catch (classified) {
          if (classified !== error) throw classified;
        }
        throw new SpotifyResponseError(
          SEARCH_ENDPOINT,
          ["body: must be valid JSON"],
          { cause: error },
        );
      }
      if (request.signal?.aborted) combined.classify(request.signal.reason);
      return body;
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

interface ValidatedSearchRequest {
  readonly query: string;
  readonly limit: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}

interface ValidatedStartPlaybackRequest {
  readonly uri: string;
  readonly itemType: "track" | "playlist";
  readonly deviceId?: string;
}

function validateStartPlaybackRequest(
  value: unknown,
): Readonly<ValidatedStartPlaybackRequest> {
  const details: string[] = [];
  if (!isPlainObject(value))
    throw new SpotifyRequestError(["request: must be a plain object"]);
  rejectUnknown(value, START_PLAYBACK_PROPERTIES, "request", details);
  let itemType: "track" | "playlist" | undefined;
  if (typeof value.uri !== "string") {
    details.push("request.uri: must be a string");
  } else if (
    value.uri.length === 0 ||
    value.uri !== value.uri.trim() ||
    value.uri.length > MAXIMUM_SPOTIFY_URI_LENGTH
  ) {
    details.push(
      `request.uri: must be a trimmed string between 1 and ${MAXIMUM_SPOTIFY_URI_LENGTH} characters`,
    );
  } else {
    const match = /^spotify:(track|playlist):([A-Za-z0-9]+)$/u.exec(value.uri);
    if (match === null)
      details.push(
        "request.uri: must be a Spotify track or playlist URI with a conservative alphanumeric ID",
      );
    else itemType = match[1] as "track" | "playlist";
  }
  let deviceId: string | undefined;
  if (value.deviceId !== undefined) {
    if (
      typeof value.deviceId !== "string" ||
      value.deviceId.length === 0 ||
      value.deviceId !== value.deviceId.trim() ||
      value.deviceId.length > MAXIMUM_DEVICE_ID_LENGTH ||
      hasControlCharacter(value.deviceId)
    ) {
      details.push(
        `request.deviceId: must be a trimmed, control-free string between 1 and ${MAXIMUM_DEVICE_ID_LENGTH} characters`,
      );
    } else deviceId = value.deviceId;
  }
  if (details.length > 0 || itemType === undefined)
    throw new SpotifyRequestError(details);
  return Object.freeze({
    uri: value.uri as string,
    itemType,
    ...(deviceId === undefined ? {} : { deviceId }),
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
}

function validateSearchRequest(
  query: unknown,
  options: SpotifySearchRequestOptions,
  fallbackTimeoutMs: number,
): Readonly<ValidatedSearchRequest> {
  const details: string[] = [];
  let normalizedQuery: string | undefined;
  if (typeof query !== "string") details.push("query: must be a string");
  else {
    normalizedQuery = query.trim();
    if (normalizedQuery.length === 0)
      details.push("query: must not be empty or whitespace-only");
    else if (normalizedQuery.length > MAXIMUM_SEARCH_QUERY_LENGTH)
      details.push(
        `query: must contain at most ${MAXIMUM_SEARCH_QUERY_LENGTH} characters`,
      );
  }
  if (!isRecord(options)) details.push("request options: must be an object");
  if (details.length > 0 || !isRecord(options) || normalizedQuery === undefined)
    throw new SpotifyRequestError(details);
  const request = validateRequestOptions(options, fallbackTimeoutMs);
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAXIMUM_SEARCH_LIMIT
  ) {
    throw new SpotifyRequestError([
      `request options.limit: must be a safe integer between 1 and ${MAXIMUM_SEARCH_LIMIT}`,
    ]);
  }
  return Object.freeze({
    query: normalizedQuery,
    limit,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    timeoutMs: request.timeoutMs,
  });
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

function parseTrackSearch(
  value: unknown,
  query: string,
): SpotifyTrackSearchResult {
  const details: string[] = [];
  if (!isRecord(value))
    throw new SpotifyResponseError(SEARCH_ENDPOINT, [
      "body: must be an object",
    ]);
  const items = readSearchItems(value, "tracks", details);
  const results: Readonly<SpotifyTrackSearchItem>[] = [];
  items?.forEach((item, index) => {
    if (item === null) return;
    const path = `body.tracks.items[${index}]`;
    if (!isRecord(item)) {
      details.push(`${path}: must be an object or null`);
      return;
    }
    const name = readNonEmpty(item.name, `${path}.name`, details);
    const uri = readNonEmpty(item.uri, `${path}.uri`, details);
    const durationMs = readNullableInteger(
      item.duration_ms,
      `${path}.duration_ms`,
      details,
      0,
    );
    const artists = parseTrackArtists(item.artists, `${path}.artists`, details);
    if (name === undefined || uri === undefined || artists === undefined)
      return;
    results.push(
      Object.freeze({
        name,
        artists,
        uri,
        ...(durationMs === undefined ? {} : { durationMs }),
      }),
    );
  });
  if (details.length > 0)
    throw new SpotifyResponseError(SEARCH_ENDPOINT, details);
  return deepFreeze({ query, results });
}

function parsePlaylistSearch(
  value: unknown,
  query: string,
): SpotifyPlaylistSearchResult {
  const details: string[] = [];
  if (!isRecord(value))
    throw new SpotifyResponseError(SEARCH_ENDPOINT, [
      "body: must be an object",
    ]);
  const items = readSearchItems(value, "playlists", details);
  const results: Readonly<SpotifyPlaylistSearchItem>[] = [];
  items?.forEach((item, index) => {
    if (item === null) return;
    const path = `body.playlists.items[${index}]`;
    if (!isRecord(item)) {
      details.push(`${path}: must be an object or null`);
      return;
    }
    const name = readNonEmpty(item.name, `${path}.name`, details);
    const uri = readNonEmpty(item.uri, `${path}.uri`, details);
    const owner = parsePlaylistOwner(item.owner, `${path}.owner`, details);
    if (name === undefined || uri === undefined || owner === undefined) return;
    results.push(Object.freeze({ name, owner, uri }));
  });
  if (details.length > 0)
    throw new SpotifyResponseError(SEARCH_ENDPOINT, details);
  return deepFreeze({ query, results });
}

function parseAvailableDevices(value: unknown): SpotifyAvailableDevices {
  const details: string[] = [];
  if (!isRecord(value))
    throw new SpotifyResponseError(DEVICES_ENDPOINT, [
      "body: must be an object",
    ]);
  if (!Array.isArray(value.devices))
    throw new SpotifyResponseError(DEVICES_ENDPOINT, [
      "body.devices: must be an array",
    ]);
  const devices: Readonly<SpotifyAvailableDevice>[] = [];
  value.devices.forEach((device, index) => {
    const path = `body.devices[${index}]`;
    if (!isRecord(device)) {
      details.push(`${path}: must be an object`);
      return;
    }
    const name = readNonEmpty(device.name, `${path}.name`, details);
    const type = readNonEmpty(device.type, `${path}.type`, details);
    const isActive = readBoolean(
      device.is_active,
      `${path}.is_active`,
      details,
    );
    const isRestricted = readBoolean(
      device.is_restricted,
      `${path}.is_restricted`,
      details,
    );
    const supportsVolume = readBoolean(
      device.supports_volume,
      `${path}.supports_volume`,
      details,
    );
    const id = readNullableString(device.id, `${path}.id`, details);
    const volumePercent = readNullableInteger(
      device.volume_percent,
      `${path}.volume_percent`,
      details,
      0,
      100,
    );
    if (
      name === undefined ||
      type === undefined ||
      isActive === undefined ||
      isRestricted === undefined ||
      supportsVolume === undefined
    )
      return;
    devices.push(
      Object.freeze({
        name,
        type,
        isActive,
        isRestricted,
        supportsVolume,
        ...(id === undefined ? {} : { id }),
        ...(volumePercent === undefined ? {} : { volumePercent }),
      }),
    );
  });
  if (details.length > 0)
    throw new SpotifyResponseError(DEVICES_ENDPOINT, details);
  return deepFreeze({ devices });
}

function readSearchItems(
  value: Record<string, unknown>,
  containerName: "tracks" | "playlists",
  details: string[],
): unknown[] | undefined {
  const containerPath = `body.${containerName}`;
  const container = value[containerName];
  if (!isRecord(container)) {
    details.push(`${containerPath}: must be an object`);
    return undefined;
  }
  if (!Array.isArray(container.items)) {
    details.push(`${containerPath}.items: must be an array`);
    return undefined;
  }
  return container.items;
}

function parseTrackArtists(
  value: unknown,
  path: string,
  details: string[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    details.push(`${path}: must be an array`);
    return undefined;
  }
  const artists: string[] = [];
  value.forEach((artist, index) => {
    if (!isRecord(artist) || !isNonEmptyString(artist.name)) {
      details.push(`${path}[${index}].name: must be a non-empty string`);
      return;
    }
    artists.push(artist.name);
  });
  return Object.freeze(artists);
}

function parsePlaylistOwner(
  value: unknown,
  path: string,
  details: string[],
): string | undefined {
  if (!isRecord(value)) {
    details.push(`${path}: must be an object`);
    return undefined;
  }
  const displayName = value.display_name;
  if (typeof displayName === "string" && displayName.trim().length > 0)
    return displayName;
  if (
    displayName !== undefined &&
    displayName !== null &&
    typeof displayName !== "string"
  ) {
    details.push(`${path}.display_name: must be a string or null`);
    return undefined;
  }
  if (isNonEmptyString(value.id)) return value.id;
  details.push(`${path}: must provide a non-empty display_name or id`);
  return undefined;
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
