import {
  type JsonValue,
  type ToolHandler,
  createToolDefinition,
} from "@agentforge/provider-sdk";
import type {
  SpotifyClient,
  SpotifyCurrentPlayback,
  SpotifyPlaylistSearchResult,
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
