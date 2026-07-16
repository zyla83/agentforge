# AgentForge Interactive Chat CLI

This example connects AgentForge to a local Ollama server and maintains an
in-memory immutable conversation while streaming assistant responses.

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

## Environment

| Variable | Default |
| --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `llama3.1:8b` |
| `AGENTFORGE_SYSTEM_PROMPT` | `You are a helpful, clear, and concise local AI assistant.` |
| `AGENTFORGE_REQUEST_TIMEOUT_MS` | `120000` |

The system prompt becomes an immutable agent profile instruction and is not
stored in conversation history.

## Commands

```text
/help   Show available commands
/info   Show current configuration
/reset  Start a new conversation
/exit   Exit the chat
```

`/quit` is an alias for `/exit`. Pressing Ctrl+C during generation cancels the
active response and retains the previous completed conversation. Pressing
Ctrl+C at the prompt exits. EOF and SIGTERM also shut the application down
cleanly.

## Architecture

The application owns the current conversation snapshot and terminal lifecycle.
AgentForge provides provider registration, the immutable profile, conversation
execution, streaming, and cancellation. Terminal behavior remains outside core.

## Known limitations

- Ollama only
- Text only
- No persistence
- No tool calling
- No Markdown rendering
- No transcript export
- No model switching during a session
