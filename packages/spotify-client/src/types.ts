export interface SpotifyRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface SpotifyPlaybackDevice {
  readonly id?: string;
  readonly name: string;
  readonly type: string;
  readonly isActive: boolean;
  readonly volumePercent?: number;
}

export interface SpotifyPlaybackItem {
  readonly type: "track" | "episode" | "unknown";
  readonly uri?: string;
  readonly name: string;
  readonly durationMs?: number;
  readonly artists?: readonly string[];
}

export interface SpotifyPlaybackSnapshot {
  readonly status: "playing" | "paused";
  readonly progressMs?: number;
  readonly device?: Readonly<SpotifyPlaybackDevice>;
  readonly item?: Readonly<SpotifyPlaybackItem>;
}

export interface SpotifyIdlePlayback {
  readonly status: "idle";
}

export type SpotifyCurrentPlayback =
  | Readonly<SpotifyIdlePlayback>
  | Readonly<SpotifyPlaybackSnapshot>;

export interface SpotifyRefreshCredential {
  readonly version: 1;
  readonly refreshToken: string;
  readonly scopes: readonly string[];
}

export interface SpotifyRefreshCredentialStore {
  load(): Promise<Readonly<SpotifyRefreshCredential> | undefined>;
  save(credential: SpotifyRefreshCredential): Promise<void>;
}

export type SpotifyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SpotifyAccessTokenSource {
  getAccessToken(options?: SpotifyRequestOptions): Promise<string>;
}
