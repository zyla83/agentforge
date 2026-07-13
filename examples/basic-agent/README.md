# Basic Agent Example

This example demonstrates the AgentForge plugin lifecycle with two plugins.
The `database` plugin initializes before `assistant`, while `assistant` shuts
down before `database`.

Build the repository and run the example:

```bash
pnpm build
pnpm example:basic
```

The output shows registration-order initialization, the running state,
reverse-order shutdown, and the stopped state.
