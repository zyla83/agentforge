<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../asstets/brand/agentforge-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="../../asstets/brand/agentforge-logo-light.svg">
    <img src="../../asstets/brand/agentforge-logo-light.svg" alt="AgentForge" width="420">
  </picture>
</p>

# AgentForge Interactive Chat CLI

This live, non-deterministic example connects AgentForge to a local Ollama
server, streams assistant responses, and persists immutable conversations with
`@agentforge/storage-filesystem`. It is not part of automated CI.

## Requirements

- Node.js 22 or newer
- A local Ollama installation
- The configured model installed locally

Install repository prerequisites and optional live components through the
[central installation guide](../../docs/INSTALLATION.md). Ollama, Spotify, and
Piper are not required by deterministic repository verification.

## Start

```bash
ollama pull llama3.1:8b
pnpm install --frozen-lockfile
pnpm build
pnpm example:chat
```

Each process starts and saves a new conversation. The CLI never resumes the
latest conversation automatically; use `/list` and `/load` to resume one.

## Environment

| Variable | Default |
| --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `llama3.1:8b` |
| `AGENTFORGE_SYSTEM_PROMPT` | `You are a helpful, clear, and concise local AI assistant.` |
| `AGENTFORGE_REQUEST_TIMEOUT_MS` | `120000` |
| `AGENTFORGE_CHAT_DATA_DIR` | `.agentforge/chat` relative to the current working directory |
| `AGENTFORGE_CHAT_TOOLS` | `off` |
| `AGENTFORGE_CHAT_TTS` | `off` |
| `AGENTFORGE_PIPER_EXECUTABLE` | Required only when TTS mode is `piper` |
| `AGENTFORGE_PIPER_MODEL` | Required only when TTS mode is `piper` |
| `AGENTFORGE_PIPER_CONFIG` | Optional explicit `.onnx.json` path in Piper mode |
| `SPOTIFY_CLIENT_ID` | Required only when tool mode is `spotify` |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:43821/callback` |
| `AGENTFORGE_SPOTIFY_DATA_DIR` | `<home>/.agentforge/spotify` |

The canonical validation rules, conditional requirements, and setup examples
for every variable are in the
[environment variable reference](../../docs/INSTALLATION.md#environment-variable-reference).

Relative data-directory overrides are resolved from the current working
directory. The system prompt becomes an immutable agent profile instruction and
is not stored in conversation history. Use `/delete` for individual
conversations; when the CLI is stopped, remove the configured data directory if
all local history should be discarded.

## Example tools

The default `off` mode preserves the existing text-only chat. Set
`AGENTFORGE_CHAT_TOOLS=example` at startup to register and enable the bundled
`calculator`, `format_text`, and `lookup_inventory` tools. The configured
Ollama model must support tool calling; compatibility is model-dependent.

POSIX-compatible shells:

```bash
AGENTFORGE_CHAT_TOOLS=example pnpm example:chat
```

PowerShell:

```powershell
$env:AGENTFORGE_CHAT_TOOLS = "example"
pnpm example:chat
```

Windows CMD:

```cmd
set AGENTFORGE_CHAT_TOOLS=example
pnpm example:chat
```

Tool calls and structured results are shown as status lines. Completed
tool-enabled turns persist their full V2 history, including assistant tool-call
messages and tool-result messages. Loading does not strip historical tool
messages or change the startup mode; continuing tool-enabled history in `off`
mode may require matching tool configuration. There is no runtime tool toggle.

Status previews are bounded, single-line, Unicode-safe, and strip terminal
control and ANSI sequences. This protects terminal layout but does not remove
secrets. Persisted history still contains full tool calls and results, so use an
appropriate storage and access policy for sensitive conversations.

Example prompts:

```text
What is 144 divided by 12?
Convert "agent forge" to uppercase.
Format "hello world" using title case.
Is AF-DOCK-01 in stock?
Show warehouse availability for AF-KEYBOARD-01.
```

The model decides whether to call a tool for any prompt.

To smoke-test model compatibility, enable example tools, ask for a deterministic
calculation, confirm the tool lifecycle lines, and confirm a final answer. The
adapter supports Ollama's tool wire contract, but support by a particular model
depends on that model and the installed Ollama version.

The terminal status lines consume `streamTurn()` lifecycle events. They do not
enable the separate programmatic tool execution observer API, so tool status is
not duplicated.

## Spotify tools

Spotify mode is an online, opt-in integration. Complete the canonical
[Spotify setup](../../docs/INSTALLATION.md#optional-spotify-setup), including
the Premium, Development Mode, redirect URI, PKCE, credential, and privacy
requirements, before selecting the dedicated mode. Provide only the non-secret
Client ID; AgentForge does not accept a client secret.

PowerShell:

```powershell
$env:AGENTFORGE_CHAT_TOOLS = "spotify"
$env:SPOTIFY_CLIENT_ID = "your-client-id"
pnpm example:chat
```

Windows CMD:

```cmd
set AGENTFORGE_CHAT_TOOLS=spotify
set SPOTIFY_CLIENT_ID=your-client-id
pnpm example:chat
```

On first use, the CLI prints an authorization URL. Open it manually. Upgrading
a credential created by the earlier read-only integration requires one new
PKCE authorization; the old credential is retained if migration fails.
Subsequent starts refresh silently. The CLI does not open a browser itself.

Spotify mode registers exactly these tools in this order:

```text
spotify_get_current_playback
spotify_search_tracks
spotify_search_playlists
spotify_get_available_devices
spotify_start_playback
```

The playback tool reports an idle, playing, or paused snapshot. The search tools
accept a required `query` of at most 200 characters and an optional `limit` from
1 through 10. The default limit is 5. Track results contain concise names,
artists, Spotify track URIs, and optional durations. Playlist results contain
names, owners, and Spotify playlist URIs. Results preserve Spotify's response
order, but AgentForge does not guarantee or control Spotify ranking.

Search performs one request with no automatic pagination, caching, follow-up
detail fetches, or retries. Device inspection returns concise Spotify Connect
metadata: optional ID, name, type, active and restricted state, volume support,
and optional volume. Device IDs can become stale and are not persisted.

`spotify_start_playback` is an external side effect. It accepts exactly one
Spotify track or playlist URI and an optional exact device ID. Without a device
ID Spotify targets the active device. An `accepted` result means only that
Spotify returned HTTP 204; it does not independently prove audible playback.
The tool does not search, list devices, verify playback, retry, or roll back the
change. Timeouts and connection failures are ambiguous and are never retried.
Restricted or unavailable devices may reject commands.

Spotify mode is explicit and opt-in, but AgentForge has no general permission
or confirmation engine. A model can invoke the registered playback tool during
a tool-enabled turn. This integration does not pause, transfer, seek, skip,
change volume, change repeat or shuffle, queue items, or resume unspecified
content. It does not modify playlists, the library, or account data. Spotify
account rules, Premium requirements, API availability, policy, and rate limits
still apply.

The refresh credential defaults to
`<home>/.agentforge/spotify/spotify-refresh-credential.json`. Override its
directory with `AGENTFORGE_SPOTIFY_DATA_DIR` or use a safe custom loopback URI
through `SPOTIFY_REDIRECT_URI` after registering that exact URI with Spotify.
The credential is sensitive local plaintext with best-effort file permissions,
not encryption or an OS credential vault. Never commit or share it. Deleting
the file forces reauthorization but does not revoke Spotify access.

Playback results, device metadata, search terms, normalized results, playback
commands, and acknowledgements are model-visible and may be stored in V2
conversation history. Observer redaction does not remove these values from
model-visible results or persisted history. AgentForge does not download,
proxy, alter, synchronize, broadcast, or otherwise handle Spotify audio.

## Local Piper speech output

Text-to-speech is disabled by default and independent of the selected tool
mode. AgentForge supports local Piper output only on Windows. Complete the
canonical [Piper installation and voice setup](../../docs/INSTALLATION.md#optional-piper-tts-setup)
first. AgentForge does not download, update, sandbox, or verify the origin of
the executable or voice.

Set explicit absolute paths in the current PowerShell session without writing
them to repository files:

```powershell
$env:AGENTFORGE_CHAT_TTS = "piper"
$env:AGENTFORGE_PIPER_EXECUTABLE = "C:\path\to\trusted\piper.exe"
$env:AGENTFORGE_PIPER_MODEL = "C:\path\to\voice.onnx"
# Optional when Piper can use the adjacent voice.onnx.json automatically:
$env:AGENTFORGE_PIPER_CONFIG = "C:\path\to\voice.onnx.json"
pnpm example:chat
```

Unset the optional config variable when relying on Piper's adjacent model
configuration:

```powershell
Remove-Item Env:AGENTFORGE_PIPER_CONFIG -ErrorAction SilentlyContinue
```

Piper mode validates all paths before the prompt opens and never searches
`PATH`, the repository, Downloads, or the user profile. Routine banner and
`/info` output show only whether TTS is off or configured, not the local paths.
On non-Windows platforms, explicit Piper mode is rejected; off mode remains
portable.

For complete, streaming, and tool-enabled turns, text is shown normally and
only the final successful assistant message is spoken once. Stream fragments,
tool traffic, prompts, commands, errors, and restored history are never spoken.
The next prompt waits for playback. Ctrl+C during synthesis or playback cancels
the owned child process; a synthesis or playback failure leaves the textual
answer visible and the next text turn remains available.

Each response uses one unique OS temporary directory and `speech.wav`, removed
after success, failure, timeout, or cancellation. Deletion is best-effort and
not secure erasure. Conversation persistence continues to store text and does
not store audio. The configured executable runs with the chat application's
user privileges, receives assistant text through stdin, and is not sandboxed.
The fixed Windows player receives only the temporary WAV path. Audible output
may be heard or captured by people and devices in the physical environment.
Local TTS does not make the Ollama or Spotify paths private or offline.

This mode provides no speech-to-text, microphone capture, wake word, voice
activity detection, continuous voice loop, cloud TTS, model-callable speech
tool, audio cache, voice cloning, SSML, volume control, or device selection.

Manual verification should use a short non-sensitive prompt. Confirm off mode,
one final spoken response after text completion, one streaming response, one
harmless Spotify read in Spotify mode, Ctrl+C cancellation, continued text chat
after a TTS failure, clean `/exit`, and absence of WAV/model/config/history
artifacts in `git status`. Do not record complete local paths or conversation
content in committed evidence.

## Commands

```text
/help                       Show available commands
/info                       Show current configuration
/reset                      Start and save a new conversation
/save                       Save the current conversation
/list                       List saved conversations
/load <conversation-id>     Load a saved conversation
/delete <conversation-id>   Delete a saved conversation
/export <file-path>         Export the current conversation
/import <file-path>         Import and save a conversation
/exit                       Exit the chat
```

`/quit` is an alias for `/exit`. Quote IDs or paths that contain spaces with
single or double quotes. File paths are resolved from the current working
directory without shell, environment-variable, or home-directory expansion.

Successful turns are saved before their completed conversation becomes active.
An explicit `/save` creates a new revision even when nothing changed. `/reset`
creates a separate stored conversation and does not delete earlier history.
`/load` is read-only and does not increment the stored revision. Deleting the
active conversation leaves it in memory as unsaved; the next save recreates it
at revision 1.

## Import and export

`/export` atomically writes a pretty V2 `agentforge.conversation` JSON document.
It does not include store revision metadata. `/import` accepts the same plain
format, validates it with core serialization, saves it, and then makes it
active. Importing an ID that already exists explicitly replaces its stored
snapshot at the next revision. Store-managed files use the distinct V2
`agentforge.conversation-store-entry` envelope and are not valid import files.

Example session:

```text
You: Explain durable conversations.
Assistant: ...
You: /save
Conversation saved.
ID: 5ab7...
Revision: 3
You: /export "./exports/my conversation.json"
You: /reset
You: /import "./exports/my conversation.json"
```

## Cancellation and persistence failures

Pressing Ctrl+C during generation cancels the active response and does not save
partial output. During Piper synthesis or playback it cancels the active speech
operation and removes its temporary output. Ctrl+C at the prompt exits. EOF and
SIGTERM also shut down cleanly without an extra save.

If generation completes but saving fails, the displayed response is not added
to subsequent context: the previous persisted conversation remains active.
Durability takes precedence over an unpersisted in-memory state. Failed,
cancelled, reset, load, and import operations preserve the current conversation.

## Architecture

The application owns the active conversation, revision, persistence commands,
and terminal lifecycle. AgentForge provides provider registration, the immutable
profile, conversation execution, streaming, and cancellation. The core engine
does not save automatically.

## Known limitations

- Ollama only
- Spotify playback inspection and catalog search require network access and external setup
- Tool calling requires explicit startup configuration and a compatible model
- No automatic resume
- No cross-process write coordination
- No runtime tool-mode switching
- No Markdown rendering
- No model switching during a session
- Piper speech output is Windows-only and has no microphone or voice-input path
