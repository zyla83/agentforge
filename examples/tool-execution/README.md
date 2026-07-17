# Tool execution example

This deterministic, non-interactive example registers the three tools from
`@agentforge/example-tools` and uses a local scripted provider to demonstrate a
two-round `ConversationEngine` turn:

1. The provider requests `calculator` with `7 × 6`.
2. AgentForge validates and executes the call.
3. The provider receives the successful result and returns the final answer.

Run it without Ollama, network access, environment variables, or interactive
input:

```bash
pnpm build
pnpm example:tools
```
