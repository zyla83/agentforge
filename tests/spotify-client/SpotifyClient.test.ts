import {
  SpotifyAbortError,
  SpotifyAuthenticationError,
  SpotifyClient,
  SpotifyHttpError,
  SpotifyRateLimitError,
  SpotifyResponseError,
  SpotifyTimeoutError,
  SpotifyTransportError,
} from "@agentforge/spotify-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const token = "test-access-token";
const source = { getAccessToken: vi.fn(async () => token) };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  source.getAccessToken.mockClear();
});

describe("SpotifyClient", () => {
  it("maps 204 to a frozen idle result and makes one exact Bearer request", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new SpotifyClient({ accessTokenSource: source, fetch });

    const result = await client.getCurrentPlayback();

    expect(result).toEqual({ status: "idle" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/me/player",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
    );
  });

  it("maps a playing track and deeply freezes normalized fields", async () => {
    const client = createJsonClient({
      is_playing: true,
      progress_ms: 42_000,
      device: {
        id: "device-id",
        name: "Desktop",
        type: "Computer",
        is_active: true,
        volume_percent: 50,
      },
      item: {
        type: "track",
        uri: "spotify:track:test",
        name: "Track",
        duration_ms: 180_000,
        artists: [{ name: "Artist One" }, { name: "Artist Two" }],
      },
    });

    const result = await client.getCurrentPlayback();

    expect(result).toEqual({
      status: "playing",
      progressMs: 42_000,
      device: {
        id: "device-id",
        name: "Desktop",
        type: "Computer",
        isActive: true,
        volumePercent: 50,
      },
      item: {
        type: "track",
        uri: "spotify:track:test",
        name: "Track",
        durationMs: 180_000,
        artists: ["Artist One", "Artist Two"],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== "idle") {
      expect(Object.isFrozen(result.device)).toBe(true);
      expect(Object.isFrozen(result.item)).toBe(true);
      expect(Object.isFrozen(result.item?.artists)).toBe(true);
    }
  });

  it.each([
    [false, null, null, { status: "paused" }],
    [
      false,
      {
        name: "Phone",
        type: "Smartphone",
        is_active: false,
        id: null,
        volume_percent: null,
      },
      null,
      {
        status: "paused",
        device: { name: "Phone", type: "Smartphone", isActive: false },
      },
    ],
  ])(
    "maps paused and nullable fields",
    async (isPlaying, device, item, expected) => {
      await expect(
        createJsonClient({
          is_playing: isPlaying,
          progress_ms: null,
          device,
          item,
        }).getCurrentPlayback(),
      ).resolves.toEqual(expected);
    },
  );

  it.each([
    [
      "episode",
      {
        type: "episode",
        name: "Episode",
        uri: "spotify:episode:test",
        duration_ms: 10,
      },
    ],
    [
      "unknown",
      { type: "audiobook", name: "Chapter", uri: null, duration_ms: null },
    ],
  ])("maps %s playback items conservatively", async (_name, item) => {
    const result = await createJsonClient({
      is_playing: true,
      progress_ms: 0,
      device: null,
      item,
    }).getCurrentPlayback();
    expect(result.status).toBe("playing");
    if (result.status !== "idle") expect(result.item?.type).toBe(_name);
  });

  it.each([
    [401, SpotifyAuthenticationError],
    [403, SpotifyHttpError],
    [404, SpotifyHttpError],
    [500, SpotifyHttpError],
  ])(
    "classifies HTTP %i without copying response text",
    async (status, ErrorType) => {
      const fetch = vi.fn(
        async () => new Response("secret server text", { status }),
      );
      const error = await new SpotifyClient({
        accessTokenSource: source,
        fetch,
      })
        .getCurrentPlayback()
        .catch((value) => value);
      expect(error).toBeInstanceOf(ErrorType);
      expect(error.message).not.toContain("secret server text");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["5", 5_000],
    ["invalid", undefined],
    ["-1", undefined],
  ])("validates Retry-After %j", async (header, expected) => {
    const fetch = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { "Retry-After": header } }),
    );
    const error = await new SpotifyClient({ accessTokenSource: source, fetch })
      .getCurrentPlayback()
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyRateLimitError);
    expect(error.retryAfterMs).toBe(expected);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid JSON and structural fields with precise paths", async () => {
    const invalidJson = new SpotifyClient({
      accessTokenSource: source,
      fetch: async () => new Response("not json", { status: 200 }),
    });
    await expect(invalidJson.getCurrentPlayback()).rejects.toMatchObject({
      name: "SpotifyResponseError",
      details: ["body: must be valid JSON"],
    });
    await expect(
      createJsonClient({
        is_playing: "yes",
        progress_ms: -1,
        device: [],
        item: 3,
      }).getCurrentPlayback(),
    ).rejects.toMatchObject({
      name: "SpotifyResponseError",
      details: expect.arrayContaining([
        "body.is_playing: must be a boolean",
        expect.stringContaining("body.progress_ms"),
        "body.device: must be an object or null",
        "body.item: must be an object or null",
      ]),
    });
  });

  it("classifies a connection failure without retrying or leaking the token", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(`failure ${token}`);
    });
    const error = await new SpotifyClient({ accessTokenSource: source, fetch })
      .getCurrentPlayback()
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyTransportError);
    expect(error.message).not.toContain(token);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a pre-aborted request before token or network work", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancel"));
    const fetch = vi.fn();
    await expect(
      new SpotifyClient({
        accessTokenSource: source,
        fetch,
      }).getCurrentPlayback({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(source.getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes mid-request cancellation from timeout", async () => {
    const abortingFetch = vi.fn(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          ),
        ),
    );
    const controller = new AbortController();
    const cancelled = new SpotifyClient({
      accessTokenSource: source,
      fetch: abortingFetch,
    }).getCurrentPlayback({ signal: controller.signal });
    controller.abort(new Error("cancel"));
    await expect(cancelled).rejects.toBeInstanceOf(SpotifyAbortError);

    vi.useFakeTimers();
    const timed = new SpotifyClient({
      accessTokenSource: source,
      fetch: abortingFetch,
    }).getCurrentPlayback({ timeoutMs: 10 });
    const assertion = expect(timed).rejects.toBeInstanceOf(SpotifyTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });
});

function createJsonClient(body: unknown): SpotifyClient {
  return new SpotifyClient({
    accessTokenSource: source,
    fetch: async () => Response.json(body),
  });
}
