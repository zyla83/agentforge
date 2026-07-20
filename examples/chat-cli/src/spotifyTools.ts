import {
  type JsonValue,
  type ToolHandler,
  createToolDefinition,
} from "@agentforge/provider-sdk";
import type {
  SpotifyClient,
  SpotifyCurrentPlayback,
} from "@agentforge/spotify-client";

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
