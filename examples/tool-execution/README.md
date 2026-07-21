<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../asstets/brand/agentforge-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="../../asstets/brand/agentforge-logo-light.svg">
    <img src="../../asstets/brand/agentforge-logo-light.svg" alt="AgentForge" width="420">
  </picture>
</p>

# Tool execution example

This deterministic, non-interactive example registers the three tools from
`@agentforge/example-tools` and uses a local scripted provider to demonstrate a
two-round `ConversationEngine` turn:

1. The provider requests `calculator` with `7 × 6`.
2. AgentForge validates and executes the call.
3. The provider receives the successful result and returns the final answer.

The example also configures an in-memory tool execution observer and prints
deterministic start and completion summaries. It does not print full arguments
or outputs through the observer.

Run it without Ollama, network access, environment variables, or interactive
input:

```bash
pnpm build
pnpm example:tools
```

It creates no files and requires no cleanup. The high-level output contains the
final answer, two provider rounds, the calculator result, and paired observer
start/completion summaries.
