# @agentforge/spotify-client

Focused Spotify integration for AgentForge applications. The package implements
Authorization Code with PKCE, refresh-token lifecycle, and read-only inspection
of the current Spotify playback state.

The current scope is intentionally narrow. It does not search Spotify, modify
playback, manage playlists or library content, download audio, or use the Web
Playback SDK. Requests are not retried automatically.

## Prerequisites

- internet access;
- Spotify Premium;
- a Spotify Developer application;
- the exact loopback redirect URI registered in that application:
  `http://127.0.0.1:43821/callback`.

The package uses PKCE `S256` and requests only
`user-read-playback-state`. It never accepts or sends a client secret. The
temporary callback listener binds only to `127.0.0.1`, is bounded by a timeout,
supports cancellation, and is closed after every outcome. Applications must
show the authorization URL to the user; the package does not launch a browser.

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
```

Pass an `AbortSignal` to token acquisition or playback requests to cancel work.
Caller cancellation, timeout, transport, authentication, HTTP, rate-limit,
malformed-response, and credential-store failures use distinct typed errors.
No request is retried and an API `401` is not replayed automatically.

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

Current-playback results may reveal listening activity and device metadata.
Applications may pass those normalized values to a model or persist them in a
conversation. No Spotify audio is downloaded, proxied, transformed, or streamed
by this package.
