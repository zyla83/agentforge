<p align="center">
  <img src="../asstets/brand/agentforge-mark.svg" alt="AgentForge" width="96" height="96">
</p>

# Installation and external dependencies

This document is the source of truth for installing the AgentForge repository
and configuring its optional live integrations. Repository development and
deterministic verification require Git, Node.js, and pnpm. Ollama, Spotify,
Piper, FFmpeg, and whisper.cpp are separate runtime integrations and are not required by
`pnpm verify:mvp`.

AgentForge does not install, download, update, or manage external executables,
models, services, accounts, or credentials. Install and trust each optional
component separately before enabling it.

## Supported and tested configurations

**Supported** means a requirement or limitation enforced by repository
manifests, source code, or an explicit platform boundary. **Tested with** records
only a configuration for which local, CI, or manual evidence exists. It does not
mean that the listed external version is the newest available version.

```text
Last documentation verification: 2026-07-22
Repository commit: c694809ab264a70e69796c33d54287c435d21924
CI evidence: https://github.com/zyla83/agentforge/actions/runs/29912269816
```

| Component | Supported requirement | Tested with | Verified on | Evidence or notes |
| --- | --- | --- | --- | --- |
| Repository | Node.js 22 or newer; pnpm exactly 11.12.0 | Windows with Node.js 22.14.0, Corepack 0.31.0, and pnpm 11.12.0 | 2026-07-22 | Local version checks |
| CI | Node.js 22; pnpm 11.12.0 | Ubuntu GitHub-hosted runner | 2026-07-22 | [Successful baseline workflow](https://github.com/zyla83/agentforge/actions/runs/29912269816) |
| Ollama | Reachable Ollama API and a locally installed selected model | Windows 10.0.26200.8875, Ollama 0.32.1, and `llama3.1:8b` | 2026-07-20 | Historical MVP manual verification in [MVP.md](MVP.md#manual-ollama-smoke-test) |
| Spotify | Internet access, Spotify Premium, and a Spotify Developer application | Personal Development Mode application; service version not user-controlled | 2026-07-20 | Manual authentication, playback inspection, search, device inspection, and playback-start checks; not part of CI |
| Piper | Compatible Piper CLI plus an ONNX voice and configuration; AgentForge playback is Windows-only | Windows 11, Python 3.13.7, `piper-tts` 1.5.0, and `pl_PL-gosia-medium` | 2026-07-22 | Package metadata plus manual UTF-8 synthesis and audible playback; not part of CI |
| Local microphone STT | Windows DirectShow capture through FFmpeg plus whisper.cpp `whisper-cli` and a compatible multilingual GGML model | Windows 11 with FFmpeg and whisper.cpp CLI versions not recorded, multilingual `ggml-small.bin` and `ggml-medium.bin`, and language `pl` | 2026-07-23 | Manual recording, direct transcription, `/voice` boundaries, recording/transcription cancellation, temporary cleanup, Piper sequencing, and a harmless Spotify search; not part of CI |

The Ollama, Spotify, and Piper checks are live manual evidence. The local
microphone STT path has deterministic test evidence only. These integrations are not
part of deterministic CI and do not guarantee compatibility with future
external releases.

## Minimal repository installation

### Requirements

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22 or newer
- pnpm 11.12.0, selected by the repository's `packageManager` field
- registry access on first dependency installation unless the required
  package-manager cache is already populated

Corepack is not bundled with every Node.js distribution that satisfies the
Node.js requirement. Corepack or pnpm may need network access on first use.

### Acquire the repository

```bash
git clone https://github.com/zyla83/agentforge.git
cd agentforge
```

Run all subsequent repository commands from the repository root.

### Windows PowerShell

```powershell
node --version
corepack --version
corepack enable pnpm
pnpm --version
pnpm install --frozen-lockfile
pnpm verify:mvp
```

### POSIX shell

```bash
node --version
corepack --version
corepack enable pnpm
pnpm --version
pnpm install --frozen-lockfile
pnpm verify:mvp
```

`pnpm --version` must print `11.12.0`. Do not run `pnpm self-update` for this
repository. The checked-in package-manager declaration selects the project
version.

If `corepack` is unavailable, use the controlled fallback documented by
[pnpm](https://pnpm.io/installation):

```bash
npm install --global corepack@latest
corepack enable pnpm
corepack pnpm --version
```

If PowerShell blocks a `pnpm.ps1` shim, use `pnpm.cmd` or
`corepack pnpm` rather than weakening the machine-wide execution policy:

```powershell
pnpm.cmd --version
corepack pnpm install --frozen-lockfile
corepack pnpm verify:mvp
```

The successful deterministic path formats and lints the repository, builds all
workspace projects, runs the complete Vitest suite and deterministic examples,
and verifies package-root consumers. It does not start Ollama, contact Spotify,
run Piper, FFmpeg, whisper.cpp, or download a model.

## Optional Ollama installation

Ollama is the only current real LLM provider. It is required only for live
generation examples and the interactive chat CLI.

Install it from the official documentation for your platform:

- [Ollama quickstart](https://docs.ollama.com/quickstart)
- [Windows](https://docs.ollama.com/windows)
- [macOS](https://docs.ollama.com/macos)
- [Linux](https://docs.ollama.com/linux)

On Windows, the standard application commonly runs in the background and
serves the API at `http://localhost:11434`; a separate `ollama serve` command is
normally unnecessary. Follow the official platform documentation rather than
assuming the same service lifecycle on every operating system.

Verify the installation and local models:

```bash
ollama --version
ollama list
ollama pull <model>
```

Downloading a model requires network access and can consume substantial disk
space. Ollama's Windows documentation notes that models may require tens to
hundreds of gigabytes.

Verify the local API from PowerShell:

```powershell
Invoke-RestMethod http://localhost:11434/api/version
Invoke-RestMethod http://localhost:11434/api/tags
```

Or from a POSIX shell with curl:

```bash
curl --fail http://localhost:11434/api/version
curl --fail http://localhost:11434/api/tags
```

Configure AgentForge before starting a live example:

```powershell
$env:OLLAMA_BASE_URL = "http://localhost:11434"
$env:OLLAMA_MODEL = "<installed-model>"
pnpm example:chat
```

```bash
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_MODEL=<installed-model> \
pnpm example:chat
```

AgentForge defaults to `http://localhost:11434` and `llama3.1:8b`. Installation
of Ollama, installation of the selected model, successful text generation, and
successful tool calling are separate checks. An adapter capability flag does
not prove that a model can produce valid tool calls. Verify tool support with a
small deterministic tool request after ordinary text chat works.

### Ollama troubleshooting

| Symptom | Check |
| --- | --- |
| CLI not found | Reopen the terminal after installation and run `ollama --version`. |
| API unavailable | Check the background application or service and request `/api/version`; run `ollama serve` only where the official platform setup requires it. |
| Model unavailable | Run `ollama list`, then `ollama pull <model>` and set `OLLAMA_MODEL` to that exact installed name. |
| Request timeout | Confirm the API URL, model size, available memory, and `AGENTFORGE_REQUEST_TIMEOUT_MS`. AgentForge does not retry automatically. |
| Text works but tools fail | Confirm the selected model and installed Ollama version support tool calling. Adapter support alone is insufficient. |

## Optional Spotify setup

Spotify tools are online and opt-in. They require:

- internet access for authorization and every Web API request;
- an active Spotify Premium subscription;
- a Spotify Developer application created in the
  [Developer Dashboard](https://developer.spotify.com/dashboard) following
  Spotify's [application guidance](https://developer.spotify.com/documentation/web-api/concepts/apps);
- Ollama live chat with a model capable of the required tool orchestration.

New applications begin in Development Mode. Under Spotify's current
[quota-mode rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
and [February 2026 migration guidance](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide),
the application owner must have Premium, a new application supports up to five
allowlisted authenticated users, and a developer can create one new Client ID.
Existing applications may retain grandfathered limits. Non-allowlisted users
can authenticate but API requests may return HTTP 403.

### Create and configure the application

1. Create an application in the Developer Dashboard.
2. Register this exact redirect URI:

   ```text
   http://127.0.0.1:43821/callback
   ```

3. Save the application's Client ID. Do not copy or configure a client secret.

Spotify requires the authorization redirect to match the Dashboard entry. The
explicit `127.0.0.1` loopback address is used because Spotify's
[redirect URI rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
allow HTTP for loopback IP literals and do not allow `localhost`.

AgentForge uses
[Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
and the `S256` challenge method, which are designed for clients that cannot
safely hold a secret. It never requires, accepts, or persists a Spotify client
secret. The implementation requests exactly these scopes, in this order:

```text
user-read-playback-state
user-modify-playback-state
```

### Configure and authorize

PowerShell:

```powershell
$env:AGENTFORGE_CHAT_TOOLS = "spotify"
$env:SPOTIFY_CLIENT_ID = "<client-id>"
$env:SPOTIFY_REDIRECT_URI = "http://127.0.0.1:43821/callback"
pnpm example:chat
```

POSIX shell:

```bash
AGENTFORGE_CHAT_TOOLS=spotify \
SPOTIFY_CLIENT_ID=<client-id> \
SPOTIFY_REDIRECT_URI=http://127.0.0.1:43821/callback \
pnpm example:chat
```

On first use, open the printed authorization URL manually and approve the two
requested scopes. The callback listener binds only to `127.0.0.1`, is bounded
by a timeout, and closes after authorization, failure, cancellation, or
timeout. Later starts use the persisted refresh credential when it remains
valid.

Verify one operation at a time:

1. Start the CLI and confirm `Spotify authorization ready.`
2. Inspect current playback with `spotify_get_current_playback`.
3. Inspect devices with `spotify_get_available_devices`.
4. Search for one track or playlist and inspect the returned Spotify URI.
5. If a playback side effect is intended, start exactly one selected URI and
   confirm the result in the Spotify application.

A successful playback-start result means only that Spotify accepted the
request with HTTP 204. It does not prove that a device produced audible audio.
Device state may become stale, and AgentForge performs no follow-up playback
verification, automatic retry, or rollback.

Spotify can return HTTP 401 for authentication failure, HTTP 403 for account,
scope, policy, allowlist, or device restrictions, and HTTP 429 when the
[Web API rate limit](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
is exceeded. AgentForge classifies these failures but does not automatically
retry them.

### Credential storage and revocation

The default credential file is:

```text
<home>/.agentforge/spotify/spotify-refresh-credential.json
```

`AGENTFORGE_SPOTIFY_DATA_DIR` changes the containing directory. Only the
versioned refresh credential is persisted; access tokens, authorization codes,
PKCE values, OAuth state, and token endpoint payloads remain in memory.

The refresh credential is sensitive plaintext. The filesystem store is not
encryption, an AgentForge credential vault, or a sandbox. Best-effort POSIX
permission flags do not create a new Windows security boundary. Never commit or
share the file.

Stop the CLI before removing the credential. Deleting it forces authorization
on the next run but does not revoke the application's access at Spotify. Revoke
access separately in [Spotify account application settings](https://www.spotify.com/account/apps/)
when required.

Remove the default local credential after stopping the CLI:

```powershell
Remove-Item (Join-Path $HOME ".agentforge\spotify\spotify-refresh-credential.json") `
  -ErrorAction SilentlyContinue
```

```bash
rm -f -- "$HOME/.agentforge/spotify/spotify-refresh-credential.json"
```

If `AGENTFORGE_SPOTIFY_DATA_DIR` was overridden, remove the fixed credential
filename from that private directory instead.

## Optional Piper TTS setup

Piper TTS is optional. AgentForge supports it only for final-response playback
in the Windows chat CLI. The integration expects a compatible Piper executable
that accepts `--model`, optional `--config`, and `--output_file`, reads text
from standard input, and writes a WAV file.

Use the current official project and documentation:

- [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)
- [Piper CLI installation](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md)
- [Piper voices](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md)

Do not use the archived `rhasspy/piper` repository as the current installation
source. The tested installation method uses the official
[`piper-tts`](https://pypi.org/project/piper-tts/) Python package in an isolated
environment. Install a supported
[Python](https://www.python.org/downloads/windows/) version first, then replace
each placeholder below with a private absolute path:

The tested `piper-tts` 1.5.0 package requires Python 3.9 or newer. Python 3.13.7
is the version recorded in the AgentForge manual verification.

```powershell
$PiperRoot = "<absolute-piper-directory>"
py -m venv "$PiperRoot\.venv"
& "$PiperRoot\.venv\Scripts\python.exe" -m pip install --upgrade pip
& "$PiperRoot\.venv\Scripts\python.exe" -m pip install piper-tts==1.5.0
& "$PiperRoot\.venv\Scripts\piper.exe" --help
```

The pinned package version above is the version manually verified with
AgentForge. Its package metadata declares GPL-3.0-or-later. If another Piper
version is selected, verify its CLI contract and license before enabling it.

Download a voice through Piper's official mechanism:

```powershell
$VoiceDirectory = "<absolute-voice-directory>"
& "$PiperRoot\.venv\Scripts\python.exe" -m piper.download_voices `
  --data-dir "$VoiceDirectory" `
  "<voice-name>"
```

Each voice requires its `.onnx` model and corresponding `.onnx.json`
configuration. Inspect the voice's `MODEL_CARD` and license before use; the
voice repository contains models with their own attribution and licensing
requirements.

Perform a short synthesis check outside the repository:

```powershell
$TestWav = Join-Path $env:TEMP "piper-installation-test.wav"
"This is a local speech test." | & "$PiperRoot\.venv\Scripts\piper.exe" `
  --model "$VoiceDirectory\<voice-name>.onnx" `
  --config "$VoiceDirectory\<voice-name>.onnx.json" `
  --output_file $TestWav
Test-Path $TestWav
Remove-Item $TestWav -ErrorAction SilentlyContinue
```

Configure the AgentForge chat CLI:

```powershell
$env:AGENTFORGE_CHAT_TTS = "piper"
$env:AGENTFORGE_PIPER_EXECUTABLE = "$PiperRoot\.venv\Scripts\piper.exe"
$env:AGENTFORGE_PIPER_MODEL = "$VoiceDirectory\<voice-name>.onnx"
$env:AGENTFORGE_PIPER_CONFIG = "$VoiceDirectory\<voice-name>.onnx.json"
pnpm example:chat
```

`AGENTFORGE_PIPER_CONFIG` may be omitted when Piper can resolve the adjacent
configuration itself. AgentForge supplies UTF-8 process input internally;
users do not need to configure `PYTHONIOENCODING`.

After installation and voice retrieval, synthesis runs locally. Installing the
Python package and downloading a voice require network access. AgentForge does
not download, update, sandbox, or verify the trustworthiness of Piper or a
voice. Piper runs with the chat application's privileges. Generated speech is
stored briefly in a dedicated temporary WAV and deleted on success or failure;
deletion is best-effort, not secure erasure. Spoken content can be heard or
captured in the physical environment.

Piper producing a valid WAV does not prove that the Windows default playback
device is available. AgentForge does not provide macOS or Linux chat playback,
voice selection, volume control, or audio output device selection.

## Optional local microphone and STT setup

Microphone transcription is optional, disabled by default, and supported only
by the Windows chat CLI. It uses an explicitly configured FFmpeg executable and
exact DirectShow audio device name to record one bounded WAV, then invokes an
explicitly configured whisper.cpp `whisper-cli` and GGML model. AgentForge does
not supply, download, update, or search `PATH` for these components.

Use only the official projects and documentation:

- [FFmpeg downloads](https://ffmpeg.org/download.html)
- [FFmpeg DirectShow input documentation](https://ffmpeg.org/ffmpeg-devices.html#dshow)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [whisper.cpp CLI documentation](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md)
- [whisper.cpp model guidance](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)

This guide uses prebuilt Windows packages. It does not require Visual Studio,
CMake, or manual compilation.

### Download a prebuilt FFmpeg package

Open the official FFmpeg download page, select **Windows EXE Files**, and choose
one of the Windows build providers listed there. Download a current 64-bit
release ZIP containing `ffmpeg.exe`, extract the complete package to a private
tools directory, and keep its supporting files together. Record the absolute
path to `bin\ffmpeg.exe`. FFmpeg itself publishes source code and links to the
available Windows executable providers from that official page; AgentForge does
not select or mirror a package.

### Download the prebuilt whisper.cpp package

Open the official [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases/latest),
expand **Assets**, and download `whisper-bin-x64.zip` for standard 64-bit
Windows CPU use. Extract the complete archive to a private tools directory.
Keep `whisper-cli.exe` beside the DLL files supplied in the archive; copying
only the executable can make it fail at startup. Do not select Win32, BLAS, or
CUDA packages unless their additional architecture or runtime requirements are
deliberately configured and verified.

### Download a multilingual GGML model

The prebuilt executable archive does not include a speech model. Follow the
official whisper.cpp model guidance and download a pre-converted multilingual
GGML model such as `ggml-small.bin` or `ggml-medium.bin`. The official
whisper.cpp download script obtains these files from the project's model
repository. An equivalent PowerShell download is:

```powershell
$WhisperRoot = "<absolute-whisper-directory>"
$ModelName = "small"
$ModelDirectory = Join-Path $WhisperRoot "models"
New-Item -ItemType Directory -Force $ModelDirectory | Out-Null
Start-BitsTransfer `
  -Source "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$ModelName.bin" `
  -Destination (Join-Path $ModelDirectory "ggml-$ModelName.bin")
```

For Polish, use a multilingual model name without `.en`. Models whose names
contain `.en` are English-only. Larger models normally require more disk,
memory, and processing time; select one explicitly and verify it locally.

Verify the chosen binaries outside the repository, replacing placeholders with
private absolute paths. First check FFmpeg and list DirectShow devices:

```powershell
$Ffmpeg = "<absolute-path-to-ffmpeg.exe>"
& $Ffmpeg -version
& $Ffmpeg -hide_banner -list_devices true -f dshow -i dummy
```

Copy the exact audio device name reported by FFmpeg. AgentForge does not
enumerate devices, invent a local device name, or implicitly select the Windows
default microphone. Ensure Windows privacy settings permit desktop applications
to access the selected microphone.

Verify `whisper-cli` and the selected model against a short, user-owned WAV:

```powershell
$Whisper = "<absolute-path-to-whisper-cli.exe>"
$WhisperModel = "<absolute-path-to-multilingual-model.bin>"
$TestWav = "<absolute-path-to-user-owned-test.wav>"
& $Whisper --help
& $Whisper -m $WhisperModel -f $TestWav -l auto -otxt -of "<absolute-output-prefix>" -np -nt
```

Then configure the current PowerShell session:

```powershell
$env:AGENTFORGE_CHAT_STT = "whisper"
$env:AGENTFORGE_FFMPEG_EXECUTABLE = "<absolute-path-to-ffmpeg.exe>"
$env:AGENTFORGE_MICROPHONE_DEVICE = "<exact-DirectShow-audio-device-name>"
$env:AGENTFORGE_WHISPER_EXECUTABLE = "<absolute-path-to-whisper-cli.exe>"
$env:AGENTFORGE_WHISPER_MODEL = "<absolute-path-to-multilingual-model.bin>"
$env:AGENTFORGE_WHISPER_LANGUAGE = "auto"
$env:AGENTFORGE_VOICE_RECORDING_SECONDS = "5"
pnpm example:chat
```

Use `/voice` for the configured default duration or `/voice <seconds>` for one
explicit whole-number duration from 1 through 30 seconds. Each command permits
one half-duplex recording only. There is no background listening, wake word,
voice activity detection, streaming transcription, or automatic microphone
selection. Ctrl+C during recording or transcription cancels the active process
and returns to the text prompt.

The configured executables run with the chat application's privileges and are
not sandboxed. Recording and transcription happen locally after installation,
but binary and model downloads may require network access. Models can require
substantial disk, memory, and CPU resources; first download and transcription
latency depend on the chosen model and machine.

Audio and transcripts are sensitive. AgentForge stores temporary audio and
transcript output in a unique operating-system temporary directory and removes
that directory best effort after every terminal path; this is not secure
erasure. Audio is never added to conversation storage. A recognized transcript
becomes ordinary model-visible user content after submission, can influence
registered tool calls, and is persisted like typed content after a successful
turn. If Spotify mode is separately enabled, recognized instructions can lead
to Spotify tool calls, including playback start. STT accuracy is not guaranteed;
monitor recognized commands before relying on resulting actions.

## Environment variable reference

Examples configure process environment variables directly. The repository does
not load `.env` files.

| Variable | Default | Validation and when required |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Non-empty string; the Ollama client additionally requires a safe HTTP(S) base URL. |
| `OLLAMA_MODEL` | `llama3.1:8b` | Non-empty string naming an installed model. |
| `AGENTFORGE_SYSTEM_PROMPT` | `You are a helpful, clear, and concise local AI assistant.` | Non-empty string. |
| `AGENTFORGE_REQUEST_TIMEOUT_MS` | `120000` | Positive finite integer in milliseconds. |
| `AGENTFORGE_CHAT_DATA_DIR` | `.agentforge/chat` | Non-empty path; relative values resolve from the current working directory. |
| `AGENTFORGE_CHAT_TOOLS` | `off` | `off`, `example`, or `spotify`; matching is trimmed and case-insensitive. |
| `AGENTFORGE_CHAT_TTS` | `off` | `off` or `piper`; matching is trimmed and case-insensitive. `piper` is rejected outside Windows. |
| `AGENTFORGE_PIPER_EXECUTABLE` | None | Existing absolute regular-file path; required only in `piper` mode. |
| `AGENTFORGE_PIPER_MODEL` | None | Existing absolute regular-file path ending in `.onnx`; required only in `piper` mode. |
| `AGENTFORGE_PIPER_CONFIG` | None | Optional existing absolute regular-file path ending in `.onnx.json` in `piper` mode. |
| `AGENTFORGE_CHAT_STT` | `off` | `off` or `whisper`; matching is trimmed and case-insensitive. `whisper` is rejected outside Windows. |
| `AGENTFORGE_FFMPEG_EXECUTABLE` | None | Existing absolute regular-file path; required only in `whisper` mode. |
| `AGENTFORGE_MICROPHONE_DEVICE` | None | Exact non-empty DirectShow audio device name, up to 256 characters and without control characters; required only in `whisper` mode. |
| `AGENTFORGE_WHISPER_EXECUTABLE` | None | Existing absolute regular-file path; required only in `whisper` mode. |
| `AGENTFORGE_WHISPER_MODEL` | None | Existing absolute regular-file path ending in `.bin`; required only in `whisper` mode. |
| `AGENTFORGE_WHISPER_LANGUAGE` | `auto` | One trimmed token of up to 32 ASCII letters, digits, `_`, or `-`; read only in `whisper` mode. |
| `AGENTFORGE_VOICE_RECORDING_SECONDS` | `5` | Whole number from 1 through 30; read only in `whisper` mode. `/voice <seconds>` can override it for one recording. |
| `SPOTIFY_CLIENT_ID` | None | Non-empty Client ID; required only in `spotify` tool mode. It is not a client secret. |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:43821/callback` | Must be `http://127.0.0.1:<port>/<path>` with port 1-65535 and no credentials, query, or fragment; required Dashboard entry must match. |
| `AGENTFORGE_SPOTIFY_DATA_DIR` | `<home>/.agentforge/spotify` | Optional non-empty credential-directory path; relative values resolve from the current working directory. |

When TTS is `off`, Piper-specific variables are ignored. When STT is `off`, all
FFmpeg, microphone, whisper.cpp, language, and recording-duration variables are
ignored. Spotify-specific variables are read only when tool mode is `spotify`.

## Platform, network, privacy, and security boundaries

| Area | Boundary |
| --- | --- |
| Package installation | First use normally contacts the configured package registry unless the required cache is already populated. |
| Ollama | Installation and model retrieval require external downloads. Local inference still runs with the privileges and resource limits of the Ollama process. |
| Spotify | Authorization and every API request require internet access. Listening activity, device metadata, searches, commands, and results may be model-visible or persisted. |
| Piper | Package and voice retrieval require external downloads. The configured executable and model are user-trusted local inputs and run with application privileges. |
| Microphone STT | FFmpeg, whisper.cpp, and model retrieval may require external downloads. Capture and transcription are local after installation. The configured binaries and model are user-trusted inputs, run with application privileges, and are not sandboxed. Temporary deletion is best-effort. |
| Conversation storage | Chat history defaults to `.agentforge/chat` relative to the launch directory and may contain prompts, responses, tool calls, and tool results. |
| Credentials | Spotify refresh credentials are sensitive plaintext. AgentForge has no credential vault. |

AgentForge is not a sandbox. Tool handlers and external executables are not
restricted to lesser privileges. There is no general confirmation engine,
automatic retry, transaction, or rollback guarantee. Completed Spotify side
effects are not undone. Observer redaction does not protect model-visible or
persisted content, and terminal sanitization is not secret redaction.

## Troubleshooting

| Problem | Actionable check |
| --- | --- |
| `corepack` is unavailable | Install Corepack through npm using the official pnpm procedure, enable pnpm, and verify version 11.12.0. |
| PowerShell refuses `pnpm.ps1` | Use `pnpm.cmd` or `corepack pnpm`; do not broadly relax execution policy solely for this repository. |
| Frozen install fails | Confirm pnpm 11.12.0, registry connectivity or cache availability, and that `pnpm-lock.yaml` is unchanged. |
| Ollama connection fails | Verify the process/service and request `http://localhost:11434/api/version`. |
| Ollama reports a missing model | Compare `OLLAMA_MODEL` with `ollama list`; pull the exact model if intended. |
| Tool calls fail while text works | Test the selected model's tool-call capability; provider declaration is not proof of model support. |
| Spotify authorization returns 403 | Check Premium status, Development Mode allowlist, requested scopes, and current Spotify policy. |
| Spotify returns 429 | Stop issuing requests and inspect `Retry-After`; AgentForge does not retry automatically. |
| Spotify callback fails | Confirm the exact Dashboard redirect URI and that the configured loopback port is available. |
| Spotify playback is accepted but silent | Inspect the active/restricted device in Spotify; HTTP 204 is acceptance, not audible-playback proof. |
| Piper executable, model, or config is rejected | Use existing absolute regular-file paths and the required `.onnx`/`.onnx.json` suffixes. |
| Piper exits non-zero or produces invalid WAV | Run the same executable and model through its CLI, review model/config compatibility, and keep the test outside the repository. |
| Piper times out | Confirm the executable and model load independently; increase the existing request timeout only after identifying expected model latency. |
| WAV playback fails | Confirm Windows default-device availability. Successful synthesis and successful playback are separate checks. |
| DirectShow microphone is unavailable | Run the official FFmpeg device-listing command again, copy the exact audio device name, and confirm the device is connected and not exclusively held elsewhere. |
| Microphone permission is denied | In Windows privacy settings, allow microphone access for desktop applications and verify the selected device independently. |
| FFmpeg produces an invalid WAV | Test the configured executable and exact DirectShow device outside AgentForge; the integration requires a non-empty RIFF/WAVE recording. |
| whisper.cpp rejects the model or WAV | Verify the model and a user-owned WAV directly with the configured `whisper-cli`; use a compatible multilingual GGML model for Polish. |
| Transcription is empty | Speak during the bounded recording, verify microphone input levels, and test the WAV and model directly; AgentForge does not submit an empty transcript. |
| Recording or transcription times out | Verify the external component independently and choose a model appropriate for available CPU and memory before increasing the shared request timeout. |
| Voice input is cancelled | Ctrl+C intentionally terminates the active recording or transcription and returns to text chat; invoke `/voice` again explicitly if desired. |
| Voice transcription has high latency | Use official whisper.cpp model guidance to choose a smaller compatible model and account for local CPU, memory, and disk constraints. |

No failure described here triggers an automatic external installation, retry,
credential repair, model replacement, or fallback provider.
