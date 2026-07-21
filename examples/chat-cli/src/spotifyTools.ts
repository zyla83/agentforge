import {
  type JsonValue,
  type ToolHandler,
  createToolDefinition,
} from "@agentforge/provider-sdk";
import type {
  SpotifyAvailableDevices,
  SpotifyClient,
  SpotifyCurrentPlayback,
  SpotifyPlaylistSearchResult,
  SpotifyStartPlaybackResult,
  SpotifyTrackSearchResult,
} from "@agentforge/spotify-client";
import { SpotifyRequestError } from "@agentforge/spotify-client";

const spotifySearchInputSchema = {
  type: "object" as const,
  properties: {
    query: { type: "string" as const, minLength: 1, maxLength: 200 },
    limit: { type: "integer" as const, minimum: 1, maximum: 10 },
  },
  required: ["query"],
  additionalProperties: false,
};

export const spotifyCurrentPlaybackToolDefinition = createToolDefinition({
  name: "spotify_get_current_playback",
  description:
    "Read the user's current Spotify playback state. This tool does not modify playback or Spotify account data.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
});

export const spotifyTrackSearchToolDefinition = createToolDefinition({
  name: "spotify_search_tracks",
  description:
    "Search the Spotify catalog for tracks. This tool does not modify playback or Spotify account data.",
  inputSchema: spotifySearchInputSchema,
});

export const spotifyPlaylistSearchToolDefinition = createToolDefinition({
  name: "spotify_search_playlists",
  description:
    "Search the Spotify catalog for playlists. This tool does not modify playback or Spotify account data.",
  inputSchema: spotifySearchInputSchema,
});

export const spotifyAvailableDevicesToolDefinition = createToolDefinition({
  name: "spotify_get_available_devices",
  description:
    "Read available Spotify Connect devices. This tool does not modify playback or Spotify account data.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
});

export const spotifyStartPlaybackToolDefinition = createToolDefinition({
  name: "spotify_start_playback",
  description:
    "Change the user's Spotify playback by starting one selected track or playlist. This tool performs an external side effect.",
  inputSchema: {
    type: "object",
    properties: {
      uri: { type: "string", minLength: 1, maxLength: 256 },
      deviceId: { type: "string", minLength: 1, maxLength: 256 },
    },
    required: ["uri"],
    additionalProperties: false,
  },
});

export function createSpotifyCurrentPlaybackToolHandler(
  client: Pick<SpotifyClient, "getCurrentPlayback">,
): ToolHandler {
  return async (_argumentsValue, context): Promise<JsonValue> => {
    const playback = await client.getCurrentPlayback(
      context.signal === undefined ? {} : { signal: context.signal },
    );
    return playback as SpotifyCurrentPlayback & JsonValue;
  };
}

export function createSpotifyTrackSearchToolHandler(
  client: Pick<SpotifyClient, "searchTracks">,
): ToolHandler {
  return async (argumentsValue, context): Promise<JsonValue> => {
    const input = validateSearchToolArguments(argumentsValue);
    const result = await client.searchTracks(input.query, {
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    return result as SpotifyTrackSearchResult & JsonValue;
  };
}

export function createSpotifyPlaylistSearchToolHandler(
  client: Pick<SpotifyClient, "searchPlaylists">,
): ToolHandler {
  return async (argumentsValue, context): Promise<JsonValue> => {
    const input = validateSearchToolArguments(argumentsValue);
    const result = await client.searchPlaylists(input.query, {
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    return result as SpotifyPlaylistSearchResult & JsonValue;
  };
}

export function createSpotifyAvailableDevicesToolHandler(
  client: Pick<SpotifyClient, "getAvailableDevices">,
): ToolHandler {
  return async (_argumentsValue, context): Promise<JsonValue> => {
    const result = await client.getAvailableDevices(
      context.signal === undefined ? {} : { signal: context.signal },
    );
    return result as SpotifyAvailableDevices & JsonValue;
  };
}

export function createSpotifyStartPlaybackToolHandler(
  client: Pick<SpotifyClient, "startPlayback">,
): ToolHandler {
  return async (argumentsValue, context): Promise<JsonValue> => {
    const request = validateStartPlaybackToolArguments(argumentsValue);
    const result = await client.startPlayback(request, {
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    return result as SpotifyStartPlaybackResult & JsonValue;
  };
}

function validateSearchToolArguments(
  value: Readonly<Record<string, JsonValue>>,
): { readonly query: string; readonly limit?: number } {
  const query = value.query;
  if (typeof query !== "string")
    throw new SpotifyRequestError(["tool arguments.query: must be a string"]);
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0)
    throw new SpotifyRequestError([
      "tool arguments.query: must not be empty or whitespace-only",
    ]);
  if (normalizedQuery.length > 200)
    throw new SpotifyRequestError([
      "tool arguments.query: must contain at most 200 characters",
    ]);
  const limit = value.limit;
  if (
    limit !== undefined &&
    (typeof limit !== "number" ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 10)
  ) {
    throw new SpotifyRequestError([
      "tool arguments.limit: must be a safe integer between 1 and 10",
    ]);
  }
  return Object.freeze({
    query: normalizedQuery,
    ...(limit === undefined ? {} : { limit }),
  });
}

function validateStartPlaybackToolArguments(
  value: Readonly<Record<string, JsonValue>>,
): { readonly uri: string; readonly deviceId?: string } {
  const details: string[] = [];
  const unknown = Object.keys(value).filter(
    (key) => key !== "uri" && key !== "deviceId",
  );
  for (const key of unknown)
    details.push(`tool arguments.${key}: unknown property`);
  const uri = value.uri;
  if (
    typeof uri !== "string" ||
    uri.length === 0 ||
    uri !== uri.trim() ||
    uri.length > 256 ||
    !/^spotify:(track|playlist):[A-Za-z0-9]+$/u.test(uri)
  ) {
    details.push(
      "tool arguments.uri: must be a valid Spotify track or playlist URI",
    );
  }
  const deviceId = value.deviceId;
  if (
    deviceId !== undefined &&
    (typeof deviceId !== "string" ||
      deviceId.length === 0 ||
      deviceId !== deviceId.trim() ||
      deviceId.length > 256 ||
      hasControlCharacter(deviceId))
  ) {
    details.push(
      "tool arguments.deviceId: must be a trimmed, control-free string between 1 and 256 characters",
    );
  }
  if (details.length > 0 || typeof uri !== "string")
    throw new SpotifyRequestError(details);
  return Object.freeze({
    uri,
    ...(typeof deviceId === "string" ? { deviceId } : {}),
  });
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
}
