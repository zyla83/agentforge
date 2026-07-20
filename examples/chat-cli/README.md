# AgentForge Interactive Chat CLI

This live, non-deterministic example connects AgentForge to a local Ollama
server, streams assistant responses, and persists immutable conversations with
`@agentforge/storage-filesystem`. It is not part of automated CI.

## Requirements

- Node.js 22 or newer
- A local Ollama installation
- The configured model installed locally

## Start

```bash
ollama serve
ollama pull llama3.1:8b
pnpm install
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
| `SPOTIFY_CLIENT_ID` | Required only when tool mode is `spotify` |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:43821/callback` |
| `AGENTFORGE_SPOTIFY_DATA_DIR` | `<home>/.agentforge/spotify` |

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

## Spotify current playback

Spotify mode is an online, opt-in integration. It requires Spotify Premium, a
Spotify Developer application, and an internet connection. Register this exact
redirect URI in the Developer Dashboard:

```text
http://127.0.0.1:43821/callback
```

Then provide the non-secret Client ID and select the dedicated mode. Do not
configure or paste a client secret.

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

On first use, the CLI prints an authorization URL. Open it manually and approve
only `user-read-playback-state`. The temporary callback listens on IPv4
loopback only and closes after authorization, failure, timeout, or cancellation.
The CLI does not open a browser itself.

Spotify mode registers only `spotify_get_current_playback`. The tool reports an
idle, playing, or paused snapshot and does not modify playback, the queue,
devices, playlists, the library, or account state. Search and playback control
are not implemented. Spotify account, scope, API availability, policy, and rate
limits still apply, and requests are never retried automatically.

The refresh credential defaults to
`<home>/.agentforge/spotify/spotify-refresh-credential.json`. Override its
directory with `AGENTFORGE_SPOTIFY_DATA_DIR` or use a safe custom loopback URI
through `SPOTIFY_REDIRECT_URI` after registering that exact URI with Spotify.
The credential is sensitive local plaintext with best-effort file permissions,
not encryption or an OS credential vault. Never commit or share it. Deleting
the file forces reauthorization but does not revoke Spotify access.

Playback results can expose listening activity and device metadata. They are
model-visible and may be stored in V2 conversation history. Observer redaction
does not remove those values from model-visible results or persisted history.
AgentForge does not download or handle Spotify audio.

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
partial output. Ctrl+C at the prompt exits. EOF and SIGTERM also shut down
cleanly without an extra save.

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
- Spotify current-playback inspection requires network access and external setup
- Tool calling requires explicit startup configuration and a compatible model
- No automatic resume
- No cross-process write coordination
- No runtime tool-mode switching
- No Markdown rendering
- No model switching during a session
