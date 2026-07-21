import {
  SpotifyAbortError,
  SpotifyAuthenticationError,
  SpotifyClient,
  SpotifyHttpError,
  SpotifyRateLimitError,
  SpotifyRequestError,
  SpotifyResponseError,
  SpotifyTimeoutError,
  SpotifyTransportError,
} from "@agentforge/spotify-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const token = "test-search-access-token";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SpotifyClient catalog search", () => {
  it("makes one exact encoded track request with the default limit", async () => {
    const fetch = vi.fn(async () => Response.json(trackResponse()));
    const getAccessToken = vi.fn(async () => token);
    const client = new SpotifyClient({
      accessTokenSource: { getAccessToken },
      fetch,
    });

    const result = await client.searchTracks("  AC/DC & + ? 東京  ");

    expect(result.query).toBe("AC/DC & + ? 東京");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.spotify.com");
    expect(url.pathname).toBe("/v1/search");
    expect([...url.searchParams.entries()]).toEqual([
      ["q", "AC/DC & + ? 東京"],
      ["type", "track"],
      ["limit", "5"],
    ]);
    expect(init).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
    );
  });

  it("makes one exact playlist request with a caller-provided limit", async () => {
    const fetch = vi.fn(async () => Response.json(playlistResponse()));
    const client = createClient(fetch);

    await client.searchPlaylists("Focus", { limit: 10 });

    const [input] = fetch.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/v1/search");
    expect([...url.searchParams.entries()]).toEqual([
      ["q", "Focus"],
      ["type", "playlist"],
      ["limit", "10"],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([1, 10])("accepts the search limit boundary %i", async (limit) => {
    const fetch = vi.fn(async () => Response.json(trackResponse()));
    await createClient(fetch).searchTracks("query", { limit });
    expect(
      new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("limit"),
    ).toBe(String(limit));
  });

  it.each([0, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "5"])(
    "rejects invalid limit %j before token or network work",
    async (limit) => {
      const fetch = vi.fn();
      const getAccessToken = vi.fn(async () => token);
      const client = new SpotifyClient({
        accessTokenSource: { getAccessToken },
        fetch,
      });
      await expect(
        client.searchTracks("query", {
          limit: limit as number,
        }),
      ).rejects.toBeInstanceOf(SpotifyRequestError);
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["", " \t\n ", "x".repeat(201), 42, null])(
    "rejects invalid query before token or network work",
    async (query) => {
      const fetch = vi.fn();
      const getAccessToken = vi.fn(async () => token);
      const client = new SpotifyClient({
        accessTokenSource: { getAccessToken },
        fetch,
      });
      await expect(
        client.searchPlaylists(query as string),
      ).rejects.toBeInstanceOf(SpotifyRequestError);
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("maps tracks, omits null entries and nullable duration, preserves order, and deeply freezes the result", async () => {
    const client = createJsonClient({
      tracks: {
        items: [
          {
            name: "First",
            uri: "spotify:track:first",
            duration_ms: 123,
            artists: [{ name: "One" }, { name: "Two" }],
          },
          null,
          {
            name: "Second",
            uri: "spotify:track:second",
            duration_ms: null,
            artists: [],
          },
        ],
      },
    });

    const result = await client.searchTracks(" tracks ");

    expect(result).toEqual({
      query: "tracks",
      results: [
        {
          name: "First",
          uri: "spotify:track:first",
          durationMs: 123,
          artists: ["One", "Two"],
        },
        {
          name: "Second",
          uri: "spotify:track:second",
          artists: [],
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.results)).toBe(true);
    expect(Object.isFrozen(result.results[0])).toBe(true);
    expect(Object.isFrozen(result.results[0]?.artists)).toBe(true);
  });

  it("maps playlist owners with display-name preference and ID fallback", async () => {
    const client = createJsonClient({
      playlists: {
        items: [
          {
            name: "First",
            uri: "spotify:playlist:first",
            owner: { display_name: "Owner One", id: "owner-one" },
          },
          null,
          {
            name: "Second",
            uri: "spotify:playlist:second",
            owner: { display_name: null, id: "owner-two" },
          },
          {
            name: "Third",
            uri: "spotify:playlist:third",
            owner: { display_name: "  ", id: "owner-three" },
          },
        ],
      },
    });

    const result = await client.searchPlaylists("lists");

    expect(result).toEqual({
      query: "lists",
      results: [
        { name: "First", owner: "Owner One", uri: "spotify:playlist:first" },
        { name: "Second", owner: "owner-two", uri: "spotify:playlist:second" },
        { name: "Third", owner: "owner-three", uri: "spotify:playlist:third" },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.results)).toBe(true);
    expect(result.results.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ["track", { tracks: { items: [] } }, { query: "none", results: [] }],
    ["playlist", { playlists: { items: [] } }, { query: "none", results: [] }],
  ] as const)("maps empty %s results", async (type, body, expected) => {
    const client = createJsonClient(body);
    const result =
      type === "track"
        ? await client.searchTracks("none")
        : await client.searchPlaylists("none");
    expect(result).toEqual(expected);
    expect(Object.isFrozen(result.results)).toBe(true);
  });

  it.each([
    [null, "body: must be an object"],
    [{}, "body.tracks: must be an object"],
    [{ tracks: {} }, "body.tracks.items: must be an array"],
    [
      { tracks: { items: [1] } },
      "body.tracks.items[0]: must be an object or null",
    ],
    [
      {
        tracks: { items: [{ name: "", uri: "spotify:track:x", artists: [] }] },
      },
      "body.tracks.items[0].name: must be a non-empty string",
    ],
    [
      { tracks: { items: [{ name: "X", uri: "", artists: [] }] } },
      "body.tracks.items[0].uri: must be a non-empty string",
    ],
    [
      {
        tracks: { items: [{ name: "X", uri: "spotify:track:x", artists: {} }] },
      },
      "body.tracks.items[0].artists: must be an array",
    ],
    [
      {
        tracks: {
          items: [{ name: "X", uri: "spotify:track:x", artists: [{}] }],
        },
      },
      "body.tracks.items[0].artists[0].name: must be a non-empty string",
    ],
    [
      {
        tracks: {
          items: [
            { name: "X", uri: "spotify:track:x", artists: [], duration_ms: -1 },
          ],
        },
      },
      "body.tracks.items[0].duration_ms",
    ],
  ])(
    "rejects malformed track search data at a precise path",
    async (body, path) => {
      await expect(
        createJsonClient(body).searchTracks("query"),
      ).rejects.toMatchObject({
        name: "SpotifyResponseError",
        details: expect.arrayContaining([expect.stringContaining(path)]),
      });
    },
  );

  it.each([
    [null, "body: must be an object"],
    [{}, "body.playlists: must be an object"],
    [{ playlists: {} }, "body.playlists.items: must be an array"],
    [
      { playlists: { items: [false] } },
      "body.playlists.items[0]: must be an object or null",
    ],
    [
      {
        playlists: {
          items: [
            { name: "", uri: "spotify:playlist:x", owner: { id: "owner" } },
          ],
        },
      },
      "body.playlists.items[0].name: must be a non-empty string",
    ],
    [
      {
        playlists: {
          items: [{ name: "X", uri: "", owner: { id: "owner" } }],
        },
      },
      "body.playlists.items[0].uri: must be a non-empty string",
    ],
    [
      {
        playlists: {
          items: [{ name: "X", uri: "spotify:playlist:x", owner: null }],
        },
      },
      "body.playlists.items[0].owner: must be an object",
    ],
    [
      {
        playlists: {
          items: [{ name: "X", uri: "spotify:playlist:x", owner: {} }],
        },
      },
      "body.playlists.items[0].owner: must provide",
    ],
    [
      {
        playlists: {
          items: [
            {
              name: "X",
              uri: "spotify:playlist:x",
              owner: { display_name: 4, id: "owner" },
            },
          ],
        },
      },
      "body.playlists.items[0].owner.display_name",
    ],
  ])(
    "rejects malformed playlist search data at a precise path",
    async (body, path) => {
      await expect(
        createJsonClient(body).searchPlaylists("query"),
      ).rejects.toMatchObject({
        name: "SpotifyResponseError",
        details: expect.arrayContaining([expect.stringContaining(path)]),
      });
    },
  );

  it("rejects invalid JSON without copying the response body", async () => {
    const client = createClient(
      vi.fn(async () => new Response("private response", { status: 200 })),
    );
    const error = await client.searchTracks("query").catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyResponseError);
    expect(error.details).toEqual(["body: must be valid JSON"]);
    expect(error.message).not.toContain("private response");
  });

  it.each([401, 403, 404, 500])(
    "classifies search HTTP %i without retries or response-body leakage",
    async (status) => {
      const fetch = vi.fn(async () => new Response("private body", { status }));
      const error = await createClient(fetch)
        .searchPlaylists("query")
        .catch((value) => value);
      expect(error).toBeInstanceOf(
        status === 401 ? SpotifyAuthenticationError : SpotifyHttpError,
      );
      expect(error.message).not.toContain("private body");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["5", 5_000],
    ["invalid", undefined],
    ["-1", undefined],
  ])(
    "classifies rate limiting with Retry-After %j",
    async (header, expected) => {
      const fetch = vi.fn(
        async () =>
          new Response(null, {
            status: 429,
            headers: { "Retry-After": header },
          }),
      );
      const error = await createClient(fetch)
        .searchTracks("query")
        .catch((value) => value);
      expect(error).toBeInstanceOf(SpotifyRateLimitError);
      expect(error.retryAfterMs).toBe(expected);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a pre-aborted search before token or fetch work", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancel"));
    const fetch = vi.fn();
    const getAccessToken = vi.fn(async () => token);
    const client = new SpotifyClient({
      accessTokenSource: { getAccessToken },
      fetch,
    });
    await expect(
      client.searchTracks("query", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes mid-request cancellation from timeout", async () => {
    const fetch = vi.fn(
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
    const cancelled = createClient(fetch).searchPlaylists("query", {
      signal: controller.signal,
    });
    controller.abort(new Error("cancel"));
    await expect(cancelled).rejects.toBeInstanceOf(SpotifyAbortError);

    vi.useFakeTimers();
    const timed = createClient(fetch).searchTracks("query", { timeoutMs: 10 });
    const assertion = expect(timed).rejects.toBeInstanceOf(SpotifyTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("cleans up caller listeners and timers after success", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await createJsonClient(trackResponse()).searchTracks("query", {
      signal: controller.signal,
    });
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), {
      once: true,
    });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies transport failure without retrying or exposing token details", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(`connection failed with ${token}`);
    });
    const error = await createClient(fetch)
      .searchTracks("query")
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyTransportError);
    expect(error.message).not.toContain(token);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function createClient(fetch: ReturnType<typeof vi.fn>): SpotifyClient {
  return new SpotifyClient({
    accessTokenSource: { getAccessToken: async () => token },
    fetch,
  });
}

function createJsonClient(body: unknown): SpotifyClient {
  return createClient(vi.fn(async () => Response.json(body)));
}

function trackResponse(): unknown {
  return {
    tracks: {
      items: [
        {
          name: "Track",
          uri: "spotify:track:test",
          duration_ms: 100,
          artists: [{ name: "Artist" }],
        },
      ],
    },
  };
}

function playlistResponse(): unknown {
  return {
    playlists: {
      items: [
        {
          name: "Playlist",
          uri: "spotify:playlist:test",
          owner: { display_name: "Owner", id: "owner" },
        },
      ],
    },
  };
}
