# @agentforge/spotify-client

Focused Spotify integration for AgentForge applications. The package implements
Authorization Code with PKCE, refresh-token lifecycle, playback and device
inspection, track and playlist catalog search, and constrained playback start.

The current scope is intentionally narrow. It can start one selected track or
playlist, but does not pause, transfer, seek, skip, change volume, modify the
queue, inspect playlist contents, manage library content, download audio, or use
the Web Playback SDK. Search has no automatic pagination or cache. Requests,
especially playback writes with ambiguous outcomes, are never retried.

## Prerequisites

- internet access;
- Spotify Premium;
- a Spotify Developer application;
- the exact loopback redirect URI registered in that application:
  `http://127.0.0.1:43821/callback`.

The package uses PKCE `S256` and requests exactly
`user-read-playback-state` and `user-modify-playback-state` in canonical order.
An older credential with only the read scope remains decodable but triggers one
explicit PKCE authorization before it is replaced. A failed migration preserves
the old credential. It never accepts or sends a client secret. The temporary
callback listener binds only to `127.0.0.1`, is bounded by a timeout, supports
cancellation, and is closed after every outcome. Applications must show the
authorization URL to the user; the package does not launch a browser.

## Package-root usage

```ts
import {
  FilesystemSpotifyCredentialStore,
  SpotifyAuthorizationSession,
  SpotifyClient,
} from "@agentforge/spotify-client";

const store = new FilesystemSpotifyCredentialStore({
  directory: "C:/Users/example/.agentforge/spotify",
});
const session = new SpotifyAuthorizationSession({
  clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  credentialStore: store,
  onAuthorizationUrl(url) {
    console.log("Open this URL manually:", url);
  },
});
const client = new SpotifyClient({ accessTokenSource: session });
const playback = await client.getCurrentPlayback({ timeoutMs: 30_000 });
const tracks = await client.searchTracks("track and artist");
const playlists = await client.searchPlaylists("focus", { limit: 10 });
const devices = await client.getAvailableDevices();
const accepted = await client.startPlayback({
  uri: tracks.results[0]?.uri ?? "spotify:track:example",
  deviceId: devices.devices[0]?.id,
});
```

Search queries are trimmed, must contain 1 through 200 characters, and return
concise immutable items in Spotify response order. The default result limit is
5 and the accepted range is 1 through 10. No offsets, next-page URLs, or
follow-up detail requests are exposed. Track results contain name, artists, URI,
and optional duration. Playlist results contain name, owner, and URI.

Pass an `AbortSignal` to token acquisition, playback, or search requests to
cancel work.
Available-device results expose only ID when present, name, type, active and
restricted state, volume support, and optional volume. Device IDs may become
stale and are never persisted by the client. Playback start accepts exactly one
`spotify:track:...` URI or one `spotify:playlist:...` URI. An omitted device ID
targets Spotify's active device. A returned `accepted` acknowledgement means
only that Spotify returned HTTP 204; it does not prove audible playback and no
follow-up verification is performed.

Caller cancellation, timeout, transport, authentication, HTTP, rate-limit,
malformed-response, and credential-store failures use distinct typed errors.
No request is retried and an API `401` is not replayed automatically. HTTP 403
may indicate an account, scope, API-policy, or restricted-device limitation.
HTTP 404 can occur when an active or selected device is unavailable. A timeout
or connection loss during playback start is ambiguous because Spotify may have
applied the command; the client never retries it.

## Credential and privacy boundary

Only a versioned refresh credential is persisted. Access tokens,
authorization codes, PKCE values, OAuth state, and token endpoint payloads stay
in memory. The filesystem store uses a fixed filename, a same-directory
temporary write, rename, and best-effort `0600` permissions.

The refresh credential is sensitive plaintext. This store is not encryption,
an OS credential vault, or a sandbox. POSIX mode flags do not create a new
security boundary on Windows. Never commit or share the credential file.
Deleting it forces authorization on the next run but does not revoke Spotify
access; revoke access through Spotify account settings when required.

Current-playback results, available devices, search terms, catalog results,
playback commands, and acknowledgements may be passed to a model or persisted
in a conversation. Observer redaction does not protect model-visible or
persisted values. Playback start is an external side effect performed with the
authenticated user's Spotify permissions; completed changes are not rolled
back. Spotify availability, policy, account rules, Premium requirements, and
rate limits still apply. No Spotify audio is downloaded, proxied, transformed,
synchronized, broadcast, or streamed by this package.
