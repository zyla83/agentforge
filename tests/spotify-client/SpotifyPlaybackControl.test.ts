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

const token = "test-playback-access-token";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SpotifyClient available devices", () => {
  it("makes one exact request and maps ordered deeply immutable devices", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        devices: [
          {
            id: "desktop-id",
            name: "Desktop",
            type: "Computer",
            is_active: true,
            is_restricted: false,
            supports_volume: true,
            volume_percent: 100,
            is_private_session: true,
          },
          {
            id: null,
            name: "Speaker",
            type: "Speaker",
            is_active: false,
            is_restricted: true,
            supports_volume: false,
            volume_percent: null,
          },
        ],
      }),
    );
    const getAccessToken = vi.fn(async () => token);
    const result = await new SpotifyClient({
      accessTokenSource: { getAccessToken },
      fetch,
    }).getAvailableDevices();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input)).toBe("https://api.spotify.com/v1/me/player/devices");
    expect(init).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(result).toEqual({
      devices: [
        {
          id: "desktop-id",
          name: "Desktop",
          type: "Computer",
          isActive: true,
          isRestricted: false,
          supportsVolume: true,
          volumePercent: 100,
        },
        {
          name: "Speaker",
          type: "Speaker",
          isActive: false,
          isRestricted: true,
          supportsVolume: false,
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.devices)).toBe(true);
    expect(result.devices.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("is_private_session");
  });

  it("returns an empty frozen device array", async () => {
    const result = await createJsonClient({
      devices: [],
    }).getAvailableDevices();
    expect(result).toEqual({ devices: [] });
    expect(Object.isFrozen(result.devices)).toBe(true);
  });

  it.each([0, 100])("accepts volume boundary %i", async (volumePercent) => {
    const result = await createJsonClient({
      devices: [deviceResponse({ volume_percent: volumePercent })],
    }).getAvailableDevices();
    expect(result.devices[0]?.volumePercent).toBe(volumePercent);
  });

  it.each([
    [null, "body: must be an object"],
    [{}, "body.devices: must be an array"],
    [{ devices: {} }, "body.devices: must be an array"],
    [{ devices: [null] }, "body.devices[0]: must be an object"],
    [{ devices: [deviceResponse({ name: "" })] }, "body.devices[0].name"],
    [{ devices: [deviceResponse({ type: "" })] }, "body.devices[0].type"],
    [
      { devices: [deviceResponse({ is_active: "true" })] },
      "body.devices[0].is_active",
    ],
    [
      { devices: [deviceResponse({ is_restricted: 0 })] },
      "body.devices[0].is_restricted",
    ],
    [
      { devices: [deviceResponse({ supports_volume: null })] },
      "body.devices[0].supports_volume",
    ],
    [{ devices: [deviceResponse({ id: "" })] }, "body.devices[0].id"],
    [
      { devices: [deviceResponse({ volume_percent: -1 })] },
      "body.devices[0].volume_percent",
    ],
    [
      { devices: [deviceResponse({ volume_percent: 101 })] },
      "body.devices[0].volume_percent",
    ],
  ])("rejects malformed device data at a precise path", async (body, path) => {
    await expect(
      createJsonClient(body).getAvailableDevices(),
    ).rejects.toMatchObject({
      name: "SpotifyResponseError",
      details: expect.arrayContaining([expect.stringContaining(path)]),
    });
  });

  it("rejects invalid JSON without copying the response body", async () => {
    const error = await createClient(
      vi.fn(async () => new Response("private body", { status: 200 })),
    )
      .getAvailableDevices()
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyResponseError);
    expect(error.message).not.toContain("private body");
  });

  it.each([401, 403, 404, 500])(
    "classifies device HTTP %i without retrying",
    async (status) => {
      const fetch = vi.fn(async () => new Response("private", { status }));
      const error = await createClient(fetch)
        .getAvailableDevices()
        .catch((value) => value);
      expect(error).toBeInstanceOf(
        status === 401 ? SpotifyAuthenticationError : SpotifyHttpError,
      );
      expect(error.message).not.toContain("private");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["5", 5_000],
    ["invalid", undefined],
  ])("classifies device rate limiting (%s)", async (header, retryAfterMs) => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 429,
          headers: { "Retry-After": header },
        }),
    );
    const error = await createClient(fetch)
      .getAvailableDevices()
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyRateLimitError);
    expect(error.retryAfterMs).toBe(retryAfterMs);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a pre-aborted request before token or fetch work", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancel"));
    const fetch = vi.fn();
    const getAccessToken = vi.fn(async () => token);
    const client = new SpotifyClient({
      accessTokenSource: { getAccessToken },
      fetch,
    });
    await expect(
      client.getAvailableDevices({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes cancellation from timeout without retrying", async () => {
    const fetch = abortableFetch();
    const controller = new AbortController();
    const cancelled = createClient(fetch).getAvailableDevices({
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort(new Error("cancel"));
    await expect(cancelled).rejects.toBeInstanceOf(SpotifyAbortError);

    vi.useFakeTimers();
    const timed = createClient(fetch).getAvailableDevices({ timeoutMs: 10 });
    const assertion = expect(timed).rejects.toBeInstanceOf(SpotifyTimeoutError);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cleans up caller listeners and timers after success", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await createJsonClient({ devices: [] }).getAvailableDevices({
      signal: controller.signal,
    });
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), {
      once: true,
    });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies transport failure without token leakage or retry", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(`failed with ${token}`);
    });
    const error = await createClient(fetch)
      .getAvailableDevices()
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyTransportError);
    expect(error.message).not.toContain(token);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("SpotifyClient start playback", () => {
  it("sends one exact track request without a device query", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const getAccessToken = vi.fn(async () => token);
    const result = await new SpotifyClient({
      accessTokenSource: { getAccessToken },
      fetch,
    }).startPlayback({ uri: "spotify:track:AbC123" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input)).toBe("https://api.spotify.com/v1/me/player/play");
    expect(init).toEqual(
      expect.objectContaining({
        method: "PUT",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: ["spotify:track:AbC123"] }),
      }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      uris: ["spotify:track:AbC123"],
    });
    expect(result).toEqual({
      status: "accepted",
      itemType: "track",
      uri: "spotify:track:AbC123",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("sends one exact playlist request with an encoded device ID", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await createClient(fetch).startPlayback({
      uri: "spotify:playlist:List123",
      deviceId: "device &+?",
    });

    const [input, init] = fetch.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/v1/me/player/play");
    expect([...url.searchParams.entries()]).toEqual([
      ["device_id", "device &+?"],
    ]);
    expect(JSON.parse(String(init?.body))).toEqual({
      context_uri: "spotify:playlist:List123",
    });
    expect(result).toEqual({
      status: "accepted",
      itemType: "playlist",
      uri: "spotify:playlist:List123",
      deviceId: "device &+?",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    new Date(0),
    {},
    { uri: "" },
    { uri: " spotify:track:abc" },
    { uri: "spotify:track:abc " },
    { uri: "https://open.spotify.com/track/abc" },
    { uri: "spotify:album:abc" },
    { uri: "spotify:track:" },
    { uri: "spotify:track:abc:def" },
    { uri: "spotify:track:abc/def" },
    { uri: "spotify:track:abc?x=1" },
    { uri: "spotify:track:abc#x" },
    { uri: "spotify:track:abc-def" },
    { uri: "spotify:track:abc", extra: true },
    { uri: "spotify:track:abc", deviceId: "" },
    { uri: "spotify:track:abc", deviceId: " device" },
    { uri: "spotify:track:abc", deviceId: "device\n" },
    { uri: "spotify:track:abc", deviceId: "x".repeat(257) },
  ])(
    "rejects invalid playback request before token or fetch",
    async (request) => {
      const fetch = vi.fn();
      const getAccessToken = vi.fn(async () => token);
      const client = new SpotifyClient({
        accessTokenSource: { getAccessToken },
        fetch,
      });
      await expect(
        client.startPlayback(request as never),
      ).rejects.toBeInstanceOf(SpotifyRequestError);
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 404, 500])(
    "classifies playback HTTP %i without retry or body leakage",
    async (status) => {
      const fetch = vi.fn(async () => new Response("private", { status }));
      const error = await createClient(fetch)
        .startPlayback({ uri: "spotify:track:abc" })
        .catch((value) => value);
      expect(error).toBeInstanceOf(
        status === 401 ? SpotifyAuthenticationError : SpotifyHttpError,
      );
      expect(error.message).not.toContain("private");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([200, 201, 202])(
    "rejects unexpected successful HTTP %i without reading a body",
    async (status) => {
      const response = new Response("private", { status });
      const text = vi.spyOn(response, "text");
      const json = vi.spyOn(response, "json");
      const fetch = vi.fn(async () => response);
      const error = await createClient(fetch)
        .startPlayback({ uri: "spotify:playlist:abc" })
        .catch((value) => value);
      expect(error).toBeInstanceOf(SpotifyResponseError);
      expect(error.message).not.toContain("private");
      expect(text).not.toHaveBeenCalled();
      expect(json).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["4", 4_000],
    ["invalid", undefined],
  ])("classifies playback rate limiting (%s)", async (header, retryAfterMs) => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 429,
          headers: { "Retry-After": header },
        }),
    );
    const error = await createClient(fetch)
      .startPlayback({ uri: "spotify:track:abc" })
      .catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyRateLimitError);
    expect(error.retryAfterMs).toBe(retryAfterMs);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a pre-aborted write before token or fetch work", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancel"));
    const fetch = vi.fn();
    const getAccessToken = vi.fn(async () => token);
    const client = new SpotifyClient({
      accessTokenSource: { getAccessToken },
      fetch,
    });
    await expect(
      client.startPlayback(
        { uri: "spotify:track:abc" },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes cancellation from ambiguous timeout and never retries", async () => {
    const fetch = abortableFetch();
    const controller = new AbortController();
    const cancelled = createClient(fetch).startPlayback(
      { uri: "spotify:track:abc" },
      { signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort(new Error("cancel"));
    await expect(cancelled).rejects.toBeInstanceOf(SpotifyAbortError);

    vi.useFakeTimers();
    const timed = createClient(fetch).startPlayback(
      { uri: "spotify:playlist:abc" },
      { timeoutMs: 10 },
    );
    const assertion = expect(timed).rejects.toBeInstanceOf(SpotifyTimeoutError);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cleans up caller listeners and timers after an accepted write", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await createClient(
      vi.fn(async () => new Response(null, { status: 204 })),
    ).startPlayback(
      { uri: "spotify:track:abc" },
      { signal: controller.signal },
    );
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), {
      once: true,
    });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies ambiguous transport failure without token leakage or retry", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(`connection lost with ${token}`);
    });
    const error = await createClient(fetch)
      .startPlayback({ uri: "spotify:track:abc" })
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

function abortableFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(
    async (_input, init) =>
      await new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        ),
      ),
  );
}

function deviceResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    id: "device-id",
    name: "Device",
    type: "Computer",
    is_active: false,
    is_restricted: false,
    supports_volume: true,
    volume_percent: 50,
    ...overrides,
  };
}
