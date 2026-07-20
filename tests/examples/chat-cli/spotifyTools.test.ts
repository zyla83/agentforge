import { createToolExecutionContext } from "@agentforge/provider-sdk";
import {
  SpotifyAbortError,
  SpotifyAuthenticationError,
} from "@agentforge/spotify-client";
import { describe, expect, it, vi } from "vitest";
import {
  createSpotifyCurrentPlaybackToolHandler,
  spotifyCurrentPlaybackToolDefinition,
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

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
