# Basic Agent Example

This is a deterministic, non-interactive example. It requires no Ollama server,
network access, environment variables, or persistent data directory.

This example demonstrates validated instance configuration, the AgentForge
plugin lifecycle with two plugins, stateless complete and streaming conversation
turns, deterministic turn cancellation, an immutable agent profile with a
reusable system prompt, and
deterministic LLM generation through the mock provider. Each plugin
receives only its own configuration. The
`database` plugin initializes before `assistant`, while `assistant` shuts down
before `database`.

Plugin lifecycle messages are emitted as structured JSON through the default
Pino logger. The main program prints the framework state for readability.

Build the repository and run the example:

```bash
pnpm build
pnpm example:basic
```

The output shows registration-order initialization, the running state, an
immutable completed conversation, an incrementally streamed turn, their recorded
request counts, the selected profile without storing its system prompt in the
conversation, cancellation before a provider call, reverse-order shutdown, and
the stopped state.
It creates no files and requires no cleanup.
