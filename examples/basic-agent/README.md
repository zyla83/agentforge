# Basic Agent Example

This example demonstrates validated instance configuration and the AgentForge
plugin lifecycle with two plugins. Each plugin receives only its own
configuration. The `database` plugin initializes before `assistant`, while
`assistant` shuts down before `database`.

Build the repository and run the example:

```bash
pnpm build
pnpm example:basic
```

The output shows registration-order initialization, the running state,
reverse-order shutdown, and the stopped state.
