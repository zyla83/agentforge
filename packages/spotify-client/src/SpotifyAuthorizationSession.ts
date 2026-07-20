import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  SpotifyAbortError,
  SpotifyAuthenticationError,
  SpotifyRequestError,
  SpotifyResponseError,
  SpotifyTimeoutError,
  SpotifyTransportError,
} from "./errors.js";
import {
  createOperationSignal,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  validateTimeout,
} from "./internal.js";
import type {
  SpotifyFetch,
  SpotifyRefreshCredential,
  SpotifyRefreshCredentialStore,
  SpotifyRequestOptions,
} from "./types.js";

export const SPOTIFY_PLAYBACK_SCOPE = "user-read-playback-state" as const;
export const DEFAULT_SPOTIFY_REDIRECT_URI =
  "http://127.0.0.1:43821/callback" as const;

const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_AUTHORIZATION_TIMEOUT_MS = 120_000;
const EXPIRY_SKEW_MS = 30_000;

export interface SpotifyRedirectTarget {
  readonly uri: string;
  readonly port: number;
  readonly path: string;
}

export interface SpotifyAuthorizationSessionOptions {
  readonly clientId: string;
  readonly redirectUri?: string;
  readonly credentialStore: SpotifyRefreshCredentialStore;
  readonly onAuthorizationUrl: (url: string) => void;
  readonly fetch?: SpotifyFetch;
  readonly now?: () => number;
  readonly random?: (size: number) => Uint8Array;
  readonly defaultTimeoutMs?: number;
  readonly authorizationTimeoutMs?: number;
  readonly authorizeEndpoint?: string;
  readonly tokenEndpoint?: string;
}

interface AccessToken {
  readonly value: string;
  readonly expiresAt: number;
}

interface TokenResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken?: string;
  readonly scopes: readonly string[];
}

export class SpotifyAuthorizationSession {
  private readonly clientId: string;
  private readonly redirect: SpotifyRedirectTarget;
  private readonly store: SpotifyRefreshCredentialStore;
  private readonly onAuthorizationUrl: (url: string) => void;
  private readonly fetchImplementation: SpotifyFetch;
  private readonly now: () => number;
  private readonly random: (size: number) => Uint8Array;
  private readonly defaultTimeoutMs: number;
  private readonly authorizationTimeoutMs: number;
  private readonly authorizeEndpoint: string;
  private readonly tokenEndpoint: string;
  private accessToken?: AccessToken;
  private operation: Promise<string> | undefined;

  constructor(options: SpotifyAuthorizationSessionOptions) {
    if (!isRecord(options))
      throw new SpotifyRequestError(["options: must be an object"]);
    if (!isNonEmptyString(options.clientId))
      throw new SpotifyRequestError([
        "options.clientId: must be a non-empty string",
      ]);
    if (
      !isRecord(options.credentialStore) ||
      typeof options.credentialStore.load !== "function" ||
      typeof options.credentialStore.save !== "function"
    ) {
      throw new SpotifyRequestError([
        "options.credentialStore: must provide load and save",
      ]);
    }
    if (typeof options.onAuthorizationUrl !== "function")
      throw new SpotifyRequestError([
        "options.onAuthorizationUrl: must be a function",
      ]);
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function")
      throw new SpotifyRequestError(["options.fetch: must be a function"]);
    if (options.now !== undefined && typeof options.now !== "function")
      throw new SpotifyRequestError(["options.now: must be a function"]);
    if (options.random !== undefined && typeof options.random !== "function")
      throw new SpotifyRequestError(["options.random: must be a function"]);
    this.clientId = options.clientId;
    this.redirect = validateSpotifyRedirectUri(
      options.redirectUri ?? DEFAULT_SPOTIFY_REDIRECT_URI,
    );
    this.store = options.credentialStore;
    this.onAuthorizationUrl = options.onAuthorizationUrl;
    this.fetchImplementation = fetchImplementation as SpotifyFetch;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? ((size) => randomBytes(size));
    this.defaultTimeoutMs = validateTimeout(
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "options.defaultTimeoutMs",
    );
    this.authorizationTimeoutMs = validateTimeout(
      options.authorizationTimeoutMs ?? DEFAULT_AUTHORIZATION_TIMEOUT_MS,
      "options.authorizationTimeoutMs",
    );
    this.authorizeEndpoint = validateHttpsEndpoint(
      options.authorizeEndpoint ?? AUTHORIZE_ENDPOINT,
      "options.authorizeEndpoint",
    );
    this.tokenEndpoint = validateHttpsEndpoint(
      options.tokenEndpoint ?? TOKEN_ENDPOINT,
      "options.tokenEndpoint",
    );
  }

  async getAccessToken(options: SpotifyRequestOptions = {}): Promise<string> {
    const request = validateRequestOptions(options, this.defaultTimeoutMs);
    if (request.signal?.aborted)
      throw new SpotifyAbortError("access-token", {
        cause: request.signal.reason,
      });
    if (
      this.accessToken !== undefined &&
      this.accessToken.expiresAt - EXPIRY_SKEW_MS > this.now()
    )
      return this.accessToken.value;
    if (this.operation !== undefined)
      return await raceCallerAbort(this.operation, request.signal);
    const operation = this.acquireAccessToken(request);
    this.operation = operation;
    try {
      return await operation;
    } finally {
      if (this.operation === operation) this.operation = undefined;
    }
  }

  private async acquireAccessToken(
    options: Required<Pick<SpotifyRequestOptions, "timeoutMs">> &
      Pick<SpotifyRequestOptions, "signal">,
  ): Promise<string> {
    const credential = await this.store.load();
    if (credential !== undefined) {
      try {
        return await this.refresh(credential, options);
      } catch (error) {
        if (!(error instanceof SpotifyAuthenticationError)) throw error;
      }
    }
    return await this.authorize(options);
  }

  private async refresh(
    credential: Readonly<SpotifyRefreshCredential>,
    options: SpotifyRequestOptions & { readonly timeoutMs: number },
  ): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
    });
    const response = await this.requestToken(body, options);
    const refreshToken = response.refreshToken ?? credential.refreshToken;
    if (response.refreshToken !== undefined) {
      await this.store.save({
        version: 1,
        refreshToken,
        scopes: response.scopes,
      });
    }
    return this.rememberAccessToken(response);
  }

  private async authorize(
    options: SpotifyRequestOptions & { readonly timeoutMs: number },
  ): Promise<string> {
    const verifier = createRandomValue(this.random, 64, "code verifier");
    const state = createRandomValue(this.random, 32, "state");
    const challenge = createHash("sha256")
      .update(verifier, "ascii")
      .digest("base64url");
    const url = new URL(this.authorizeEndpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: SPOTIFY_PLAYBACK_SCOPE,
      redirect_uri: this.redirect.uri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    }).toString();
    const codePromise = waitForAuthorizationCode(
      this.redirect,
      state,
      this.authorizationTimeoutMs,
      options.signal,
      () => this.onAuthorizationUrl(url.toString()),
    );
    const code = await codePromise;
    const response = await this.requestToken(
      new URLSearchParams({
        client_id: this.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirect.uri,
        code_verifier: verifier,
      }),
      options,
    );
    if (response.refreshToken === undefined)
      throw new SpotifyResponseError("token", [
        "body.refresh_token: is required for authorization",
      ]);
    await this.store.save({
      version: 1,
      refreshToken: response.refreshToken,
      scopes: response.scopes,
    });
    return this.rememberAccessToken(response);
  }

  private rememberAccessToken(response: TokenResponse): string {
    this.accessToken = {
      value: response.accessToken,
      expiresAt: this.now() + response.expiresIn * 1000,
    };
    return response.accessToken;
  }

  private async requestToken(
    body: URLSearchParams,
    options: SpotifyRequestOptions & { readonly timeoutMs: number },
  ): Promise<TokenResponse> {
    const combined = createOperationSignal(
      "token",
      options.signal,
      options.timeoutMs,
    );
    try {
      const response = await this.fetchImplementation(this.tokenEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: combined.signal,
      });
      if (options.signal?.aborted) combined.classify(options.signal.reason);
      if (!response.ok) {
        if (response.status === 400 || response.status === 401)
          throw new SpotifyAuthenticationError(
            "Spotify rejected the authentication credential. Reauthorization is required.",
            undefined,
            response.status,
          );
        throw new SpotifyTransportError("token-http", {
          cause: new Error(`HTTP ${response.status}`),
        });
      }
      let value: unknown;
      try {
        value = await response.json();
      } catch (error) {
        throw new SpotifyResponseError("token", ["body: must be valid JSON"], {
          cause: error,
        });
      }
      return parseTokenResponse(value);
    } catch (error) {
      if (
        error instanceof SpotifyAuthenticationError ||
        error instanceof SpotifyResponseError ||
        error instanceof SpotifyTransportError
      )
        throw error;
      try {
        combined.classify(error);
      } catch (classified) {
        if (classified !== error) throw classified;
      }
      throw new SpotifyTransportError("token");
    } finally {
      combined.cleanup();
    }
  }
}

export function validateSpotifyRedirectUri(
  value: unknown,
): Readonly<SpotifyRedirectTarget> {
  if (!isNonEmptyString(value))
    throw new SpotifyRequestError(["redirect URI: must be a non-empty string"]);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SpotifyRequestError(["redirect URI: must be an absolute URL"]);
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.port === "" ||
    parsed.pathname === "/"
  ) {
    throw new SpotifyRequestError([
      "redirect URI: must be http://127.0.0.1:<port>/<path> without credentials, query, or fragment",
    ]);
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new SpotifyRequestError([
      "redirect URI: port must be between 1 and 65535",
    ]);
  return Object.freeze({ uri: parsed.toString(), port, path: parsed.pathname });
}

function validateHttpsEndpoint(value: unknown, path: string): string {
  if (!isNonEmptyString(value))
    throw new SpotifyRequestError([`${path}: must be an HTTPS URL`]);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SpotifyRequestError([`${path}: must be an absolute HTTPS URL`]);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new SpotifyRequestError([
      `${path}: must be a credential-free HTTPS URL without query or fragment`,
    ]);
  return url.toString();
}

function validateRequestOptions(
  options: SpotifyRequestOptions,
  fallback: number,
): { readonly signal?: AbortSignal; readonly timeoutMs: number } {
  if (!isRecord(options))
    throw new SpotifyRequestError(["request options: must be an object"]);
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal))
    throw new SpotifyRequestError([
      "request options.signal: must be an AbortSignal",
    ]);
  return Object.freeze({
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    timeoutMs: validateTimeout(
      options.timeoutMs ?? fallback,
      "request options.timeoutMs",
    ),
  });
}

function createRandomValue(
  source: (size: number) => Uint8Array,
  size: number,
  name: string,
): string {
  const bytes = source(size);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size)
    throw new SpotifyRequestError([
      `random ${name}: source returned an invalid byte array`,
    ]);
  return Buffer.from(bytes).toString("base64url");
}

function parseTokenResponse(value: unknown): TokenResponse {
  const details: string[] = [];
  if (!isRecord(value))
    throw new SpotifyResponseError("token", ["body: must be an object"]);
  if (!isNonEmptyString(value.access_token))
    details.push("body.access_token: must be a non-empty string");
  if (value.token_type !== "Bearer")
    details.push('body.token_type: must be "Bearer"');
  if (
    typeof value.expires_in !== "number" ||
    !Number.isSafeInteger(value.expires_in) ||
    value.expires_in <= 0
  )
    details.push("body.expires_in: must be a positive integer");
  if (
    value.refresh_token !== undefined &&
    !isNonEmptyString(value.refresh_token)
  )
    details.push("body.refresh_token: must be a non-empty string when present");
  if (!isNonEmptyString(value.scope))
    details.push("body.scope: must be a non-empty string");
  const scopes = isNonEmptyString(value.scope)
    ? value.scope.split(/\s+/u).filter(Boolean)
    : [];
  if (scopes.length !== 1 || scopes[0] !== SPOTIFY_PLAYBACK_SCOPE)
    details.push(`body.scope: must grant exactly ${SPOTIFY_PLAYBACK_SCOPE}`);
  if (details.length > 0) throw new SpotifyResponseError("token", details);
  return deepFreeze({
    accessToken: value.access_token as string,
    expiresIn: value.expires_in as number,
    ...(value.refresh_token === undefined
      ? {}
      : { refreshToken: value.refresh_token as string }),
    scopes,
  });
}

async function waitForAuthorizationCode(
  redirect: SpotifyRedirectTarget,
  state: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  onReady: () => void,
): Promise<string> {
  if (signal?.aborted)
    throw new SpotifyAbortError("authorization", { cause: signal.reason });
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const server = createServer((request, response) => {
      const method = request.method ?? "";
      const requestUrl = new URL(request.url ?? "/", redirect.uri);
      if (requestUrl.pathname !== redirect.path) {
        response
          .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
          .end("Not found.");
        return;
      }
      if (method !== "GET") {
        response
          .writeHead(405, {
            Allow: "GET",
            "Content-Type": "text/plain; charset=utf-8",
          })
          .end("Method not allowed.");
        return;
      }
      const returnedState = requestUrl.searchParams.get("state");
      const denial = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      if (returnedState !== state)
        return complete(
          new SpotifyAuthenticationError(
            "Spotify authorization state did not match.",
          ),
          response,
        );
      if (denial !== null)
        return complete(
          new SpotifyAuthenticationError("Spotify authorization was denied."),
          response,
        );
      if (!isNonEmptyString(code))
        return complete(
          new SpotifyAuthenticationError(
            "Spotify authorization callback did not include a code.",
          ),
          response,
        );
      complete(undefined, response, code);
    });
    const timer = setTimeout(
      () => finish(new SpotifyTimeoutError("authorization", timeoutMs)),
      timeoutMs,
    );
    const onAbort = (): void =>
      finish(new SpotifyAbortError("authorization", { cause: signal?.reason }));
    const onServerError = (error: Error): void =>
      finish(
        new SpotifyTransportError("authorization-listener", { cause: error }),
      );
    signal?.addEventListener("abort", onAbort, { once: true });
    server.once("error", onServerError);
    server.listen(redirect.port, "127.0.0.1", () => {
      try {
        onReady();
      } catch (error) {
        finish(new SpotifyTransportError("authorization-notification"));
      }
    });

    function complete(
      error: Error | undefined,
      response: import("node:http").ServerResponse,
      code?: string,
    ): void {
      response.writeHead(error === undefined ? 200 : 400, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(
        error === undefined
          ? "<!doctype html><title>Spotify authorized</title><p>Authorization complete. You may close this window.</p>"
          : "<!doctype html><title>Spotify authorization failed</title><p>Authorization failed. Return to the terminal.</p>",
        () => finish(error, code),
      );
    }

    function finish(error?: Error, code?: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      server.removeListener("error", onServerError);
      const settle = (): void => {
        if (error !== undefined) reject(error);
        else resolve(code as string);
      };
      if (!server.listening) {
        settle();
        return;
      }
      server.closeAllConnections?.();
      server.close(settle);
    }
  });
}

async function raceCallerAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal === undefined) return await promise;
  if (signal.aborted)
    throw new SpotifyAbortError("access-token", { cause: signal.reason });
  return await new Promise<T>((resolve, reject) => {
    const onAbort = (): void =>
      reject(new SpotifyAbortError("access-token", { cause: signal.reason }));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
