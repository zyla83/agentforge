import { createToolExecutionContext } from "@agentforge/provider-sdk";
import {
  SpotifyAbortError,
  SpotifyAuthenticationError,
} from "@agentforge/spotify-client";
import { describe, expect, it, vi } from "vitest";
import {
  createSpotifyCurrentPlaybackToolHandler,
  createSpotifyPlaylistSearchToolHandler,
  createSpotifyTrackSearchToolHandler,
  spotifyCurrentPlaybackToolDefinition,
  spotifyPlaylistSearchToolDefinition,
  spotifyTrackSearchToolDefinition,
} from "../../../examples/chat-cli/src/spotifyTools.js";

describe("Spotify current playback tool", () => {
  it("has the exact read-only empty-input contract", () => {
    expect(spotifyCurrentPlaybackToolDefinition).toEqual({
      name: "spotify_get_current_playback",
      description: expect.stringMatching(/read.*does not modify/iu),
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    });
    expect(Object.isFrozen(spotifyCurrentPlaybackToolDefinition)).toBe(true);
  });

  it.each([
    { status: "idle" as const },
    {
      status: "paused" as const,
      item: { type: "track" as const, name: "Track" },
    },
    {
      status: "playing" as const,
      progressMs: 10,
      device: { name: "Desktop", type: "Computer", isActive: true },
    },
  ])(
    "returns the immutable normalized result with one request",
    async (playback) => {
      const frozen = deepFreeze(playback);
      const getCurrentPlayback = vi.fn(async () => frozen);
      const handler = createSpotifyCurrentPlaybackToolHandler({
        getCurrentPlayback,
      });
      const result = await handler({}, createToolExecutionContext());
      expect(result).toBe(frozen);
      expect(Object.isFrozen(result)).toBe(true);
      expect(getCurrentPlayback).toHaveBeenCalledTimes(1);
    },
  );

  it("passes cancellation through and preserves typed failures", async () => {
    const controller = new AbortController();
    const getCurrentPlayback = vi.fn(async (options) => {
      expect(options.signal).toBe(controller.signal);
      throw new SpotifyAbortError("get-current-playback");
    });
    const handler = createSpotifyCurrentPlaybackToolHandler({
      getCurrentPlayback,
    });
    await expect(
      handler({}, createToolExecutionContext({ signal: controller.signal })),
    ).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(getCurrentPlayback).toHaveBeenCalledTimes(1);

    const authenticationHandler = createSpotifyCurrentPlaybackToolHandler({
      getCurrentPlayback: async () => {
        throw new SpotifyAuthenticationError();
      },
    });
    await expect(
      authenticationHandler({}, createToolExecutionContext()),
    ).rejects.toBeInstanceOf(SpotifyAuthenticationError);
  });
});

describe("Spotify search tools", () => {
  it.each([
    [spotifyTrackSearchToolDefinition, "spotify_search_tracks", "tracks"],
    [
      spotifyPlaylistSearchToolDefinition,
      "spotify_search_playlists",
      "playlists",
    ],
  ])("defines the exact immutable %s contract", (definition, name, subject) => {
    expect(definition).toEqual({
      name,
      description: expect.stringMatching(
        new RegExp(`search.*Spotify.*${subject}.*does not modify`, "iu"),
      ),
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 200 },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.inputSchema)).toBe(true);
    expect(Object.isFrozen(definition.inputSchema.properties)).toBe(true);
  });

  it("forwards a trimmed track query without inventing a default limit", async () => {
    const result = deepFreeze({
      query: "Track",
      results: [
        {
          name: "Track",
          artists: ["Artist"],
          uri: "spotify:track:test",
        },
      ],
    });
    const searchTracks = vi.fn(async () => result);
    const handler = createSpotifyTrackSearchToolHandler({ searchTracks });
    const argumentsValue = Object.freeze({ query: "  Track  " });

    const received = await handler(
      argumentsValue,
      createToolExecutionContext(),
    );

    expect(received).toBe(result);
    expect(searchTracks).toHaveBeenCalledTimes(1);
    expect(searchTracks).toHaveBeenCalledWith("Track", {});
    expect(argumentsValue).toEqual({ query: "  Track  " });
  });

  it("forwards playlist limit and execution cancellation exactly once", async () => {
    const controller = new AbortController();
    const result = deepFreeze({ query: "Focus", results: [] });
    const searchPlaylists = vi.fn(async () => result);
    const handler = createSpotifyPlaylistSearchToolHandler({ searchPlaylists });

    await expect(
      handler(
        Object.freeze({ query: "Focus", limit: 10 }),
        createToolExecutionContext({ signal: controller.signal }),
      ),
    ).resolves.toBe(result);
    expect(searchPlaylists).toHaveBeenCalledTimes(1);
    expect(searchPlaylists).toHaveBeenCalledWith("Focus", {
      limit: 10,
      signal: controller.signal,
    });
  });

  it.each(["", " \t\n "])(
    "rejects whitespace-only query %j before client work",
    async (query) => {
      const searchTracks = vi.fn();
      const handler = createSpotifyTrackSearchToolHandler({ searchTracks });
      await expect(
        handler({ query }, createToolExecutionContext()),
      ).rejects.toMatchObject({ name: "SpotifyRequestError" });
      expect(searchTracks).not.toHaveBeenCalled();
    },
  );

  it("propagates typed client errors without mutating arguments", async () => {
    const error = new SpotifyAuthenticationError();
    const searchPlaylists = vi.fn(async () => {
      throw error;
    });
    const handler = createSpotifyPlaylistSearchToolHandler({ searchPlaylists });
    const argumentsValue = deepFreeze({ query: "Focus", limit: 1 });

    await expect(
      handler(argumentsValue, createToolExecutionContext()),
    ).rejects.toBe(error);
    expect(searchPlaylists).toHaveBeenCalledTimes(1);
    expect(argumentsValue).toEqual({ query: "Focus", limit: 1 });
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
