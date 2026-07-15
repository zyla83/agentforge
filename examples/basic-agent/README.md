# Basic Agent Example

This example demonstrates validated instance configuration, the AgentForge
plugin lifecycle with two plugins, and a deterministic LLM generation through
the mock provider. Each plugin receives only its own configuration. The
`database` plugin initializes before `assistant`, while `assistant` shuts down
before `database`.

Plugin lifecycle messages are emitted as structured JSON through the default
Pino logger. The main program prints the framework state for readability.

Build the repository and run the example:

```bash
pnpm build
pnpm example:basic
```

The output shows registration-order initialization, the running state, one mock
LLM response with its recorded request count, reverse-order shutdown, and the
stopped state.
