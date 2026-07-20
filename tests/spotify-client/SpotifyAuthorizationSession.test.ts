import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  DEFAULT_SPOTIFY_REDIRECT_URI,
  SPOTIFY_PLAYBACK_SCOPE,
  SpotifyAbortError,
  SpotifyAuthenticationError,
  SpotifyAuthorizationSession,
  SpotifyResponseError,
  SpotifyTimeoutError,
  validateSpotifyRedirectUri,
} from "@agentforge/spotify-client";
import type {
  SpotifyRefreshCredential,
  SpotifyRefreshCredentialStore,
} from "@agentforge/spotify-client";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Spotify Authorization Code with PKCE", () => {
  it("validates exact loopback redirect URIs", () => {
    expect(validateSpotifyRedirectUri(DEFAULT_SPOTIFY_REDIRECT_URI)).toEqual({
      uri: DEFAULT_SPOTIFY_REDIRECT_URI,
      port: 43821,
      path: "/callback",
    });
    expect(
      Object.isFrozen(validateSpotifyRedirectUri(DEFAULT_SPOTIFY_REDIRECT_URI)),
    ).toBe(true);
    for (const value of [
      "https://127.0.0.1:43821/callback",
      "http://localhost:43821/callback",
      "http://0.0.0.0:43821/callback",
      "http://127.0.0.1/callback",
      "http://user@127.0.0.1:43821/callback",
      "http://127.0.0.1:43821/",
      "http://127.0.0.1:43821/callback?x=1",
      "http://127.0.0.1:43821/callback#x",
    ]) {
      expect(() => validateSpotifyRedirectUri(value)).toThrow();
    }
  });

  it("uses deterministic S256 PKCE, exact scope, validates state, exchanges code, and persists only refresh fields", async () => {
    const port = 45137;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const store = createMemoryStore();
    const tokenFetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = init?.body as URLSearchParams;
        expect(body.get("client_secret")).toBeNull();
        expect(body.get("grant_type")).toBe("authorization_code");
        expect(body.get("code")).toBe("test-code");
        return Response.json({
          access_token: "access-value",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "refresh-value",
          scope: SPOTIFY_PLAYBACK_SCOPE,
        });
      },
    );
    let authorizationUrl: URL | undefined;
    const random = vi
      .fn<(size: number) => Uint8Array>()
      .mockImplementationOnce((size) => new Uint8Array(size).fill(1))
      .mockImplementationOnce((size) => new Uint8Array(size).fill(2));
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      redirectUri,
      credentialStore: store,
      fetch: tokenFetch,
      random,
      onAuthorizationUrl: (value) => {
        authorizationUrl = new URL(value);
        const state = authorizationUrl.searchParams.get("state");
        void fetch(
          `${redirectUri}?code=test-code&state=${encodeURIComponent(state ?? "")}`,
        );
      },
    });

    await expect(session.getAccessToken()).resolves.toBe("access-value");
    expect(authorizationUrl?.origin + authorizationUrl?.pathname).toBe(
      "https://accounts.spotify.com/authorize",
    );
    expect(authorizationUrl?.searchParams.get("scope")).toBe(
      SPOTIFY_PLAYBACK_SCOPE,
    );
    expect(authorizationUrl?.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl?.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    const verifier = Buffer.from(new Uint8Array(64).fill(1)).toString(
      "base64url",
    );
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(authorizationUrl?.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(verifier, "ascii").digest("base64url"),
    );
    expect(store.saved).toEqual({
      version: 1,
      refreshToken: "refresh-value",
      scopes: [SPOTIFY_PLAYBACK_SCOPE],
    });
    expect(Object.keys(store.saved ?? {}).sort()).toEqual([
      "refreshToken",
      "scopes",
      "version",
    ]);
    expect(tokenFetch).toHaveBeenCalledTimes(1);
    await expect(canBind(port)).resolves.toBe(true);
  });

  it("rejects state mismatch without exchanging a code and cleans up", async () => {
    const port = 45138;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const fetchToken = vi.fn();
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      redirectUri,
      credentialStore: createMemoryStore(),
      fetch: fetchToken,
      random: (size) => new Uint8Array(size).fill(3),
      onAuthorizationUrl: () => {
        void fetch(`${redirectUri}?code=test-code&state=wrong`);
      },
    });
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(
      SpotifyAuthenticationError,
    );
    expect(fetchToken).not.toHaveBeenCalled();
    await expect(canBind(port)).resolves.toBe(true);
  });

  it.each([
    ["?error=access_denied", "denied"],
    ["", "did not include a code"],
  ])(
    "handles an OAuth callback failure without reflecting query values",
    async (query, message) => {
      const port = query.length === 0 ? 45140 : 45141;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      let responseText = "";
      const session = new SpotifyAuthorizationSession({
        clientId: "client-id",
        redirectUri,
        credentialStore: createMemoryStore(),
        random: (size) => new Uint8Array(size).fill(5),
        onAuthorizationUrl: (authorizationUrl) => {
          const state =
            new URL(authorizationUrl).searchParams.get("state") ?? "";
          void fetch(
            `${redirectUri}${query}${query.length === 0 ? "?" : "&"}state=${encodeURIComponent(state)}`,
          ).then(async (response) => {
            responseText = await response.text();
          });
        },
      });
      await expect(session.getAccessToken()).rejects.toThrow(message);
      expect(responseText).not.toContain("access_denied");
      await expect(canBind(port)).resolves.toBe(true);
    },
  );

  it("ignores unrelated paths and unsupported methods until a valid callback arrives", async () => {
    const port = 45142;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const tokenFetch = vi.fn(async () =>
      Response.json({
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh",
        scope: SPOTIFY_PLAYBACK_SCOPE,
      }),
    );
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      redirectUri,
      credentialStore: createMemoryStore(),
      fetch: tokenFetch,
      random: (size) => new Uint8Array(size).fill(6),
      onAuthorizationUrl: (authorizationUrl) => {
        const state = new URL(authorizationUrl).searchParams.get("state") ?? "";
        void (async () => {
          expect(
            (await fetch(`http://127.0.0.1:${port}/unrelated`)).status,
          ).toBe(404);
          expect(
            (await fetch(`${redirectUri}?state=${state}`, { method: "POST" }))
              .status,
          ).toBe(405);
          await fetch(
            `${redirectUri}?code=code&state=${encodeURIComponent(state)}`,
          );
        })();
      },
    });
    await expect(session.getAccessToken()).resolves.toBe("access");
    expect(tokenFetch).toHaveBeenCalledTimes(1);
  });

  it("closes the callback server when authorization is cancelled", async () => {
    const port = 45139;
    const controller = new AbortController();
    let markReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      redirectUri: `http://127.0.0.1:${port}/callback`,
      credentialStore: createMemoryStore(),
      random: (size) => new Uint8Array(size).fill(4),
      onAuthorizationUrl: () => markReady?.(),
    });
    const pending = session.getAccessToken({ signal: controller.signal });
    await ready;
    controller.abort(new Error("cancel"));
    await expect(pending).rejects.toBeInstanceOf(SpotifyAbortError);
    await expect(canBind(port)).resolves.toBe(true);
  });

  it("times out authorization and closes the callback server", async () => {
    vi.useFakeTimers();
    const port = 45143;
    let markReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      redirectUri: `http://127.0.0.1:${port}/callback`,
      credentialStore: createMemoryStore(),
      authorizationTimeoutMs: 100,
      random: (size) => new Uint8Array(size).fill(7),
      onAuthorizationUrl: () => markReady?.(),
    });
    const pending = session.getAccessToken();
    await ready;
    const assertion =
      expect(pending).rejects.toBeInstanceOf(SpotifyTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    await expect(canBind(port)).resolves.toBe(true);
  });

  it("rejects pre-aborted token acquisition before loading credentials", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancel"));
    const store = createMemoryStore();
    const load = vi.spyOn(store, "load");
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      credentialStore: store,
      onAuthorizationUrl: () => undefined,
    });
    await expect(
      session.getAccessToken({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(load).not.toHaveBeenCalled();
  });

  it("propagates cancellation through an active refresh request", async () => {
    const controller = new AbortController();
    const store = createMemoryStore({
      version: 1,
      refreshToken: "refresh",
      scopes: [SPOTIFY_PLAYBACK_SCOPE],
    });
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fetchToken = vi.fn(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          markStarted?.();
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      credentialStore: store,
      fetch: fetchToken,
      onAuthorizationUrl: () => undefined,
    });
    const pending = session.getAccessToken({ signal: controller.signal });
    await started;
    controller.abort(new Error("cancel"));
    await expect(pending).rejects.toBeInstanceOf(SpotifyAbortError);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it("refreshes before expiry, rotates credentials, preserves an omitted refresh token, and coalesces requests", async () => {
    let now = 1_000;
    const store = createMemoryStore({
      version: 1,
      refreshToken: "old-refresh",
      scopes: [SPOTIFY_PLAYBACK_SCOPE],
    });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tokenFetch = vi.fn(async () => {
      await gate;
      return Response.json({
        access_token: "first-access",
        token_type: "Bearer",
        expires_in: 60,
        refresh_token: "rotated-refresh",
        scope: SPOTIFY_PLAYBACK_SCOPE,
      });
    });
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      credentialStore: store,
      fetch: tokenFetch,
      now: () => now,
      onAuthorizationUrl: () => {
        throw new Error("authorization should not run");
      },
    });
    const first = session.getAccessToken();
    const concurrent = session.getAccessToken();
    release?.();
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      "first-access",
      "first-access",
    ]);
    expect(tokenFetch).toHaveBeenCalledTimes(1);
    expect(store.saved?.refreshToken).toBe("rotated-refresh");

    now += 31_000;
    tokenFetch.mockResolvedValueOnce(
      Response.json({
        access_token: "second-access",
        token_type: "Bearer",
        expires_in: 60,
        scope: SPOTIFY_PLAYBACK_SCOPE,
      }),
    );
    await expect(session.getAccessToken()).resolves.toBe("second-access");
    expect(store.saved?.refreshToken).toBe("rotated-refresh");
  });

  it("rejects malformed token responses without exposing secret values", async () => {
    const store = createMemoryStore({
      version: 1,
      refreshToken: "never-print-this",
      scopes: [SPOTIFY_PLAYBACK_SCOPE],
    });
    const session = new SpotifyAuthorizationSession({
      clientId: "client-id",
      credentialStore: store,
      fetch: async () =>
        Response.json({
          access_token: "secret-access",
          token_type: "wrong",
          expires_in: -1,
          scope: "other",
        }),
      onAuthorizationUrl: () => {
        throw new Error("not expected");
      },
    });
    const error = await session.getAccessToken().catch((value) => value);
    expect(error).toBeInstanceOf(SpotifyResponseError);
    expect(error.message).not.toContain("never-print-this");
    expect(error.message).not.toContain("secret-access");
  });
});

function createMemoryStore(
  initial?: SpotifyRefreshCredential,
): SpotifyRefreshCredentialStore & {
  saved?: Readonly<SpotifyRefreshCredential>;
} {
  return {
    saved: initial,
    async load() {
      return this.saved;
    },
    async save(value) {
      this.saved = Object.freeze({
        ...value,
        scopes: Object.freeze([...value.scopes]),
      });
    },
  };
}

async function canBind(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
