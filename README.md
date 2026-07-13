# AgentForge

AgentForge is an offline-first AI agent framework.

## Requirements

- Node.js 22 or newer
- Corepack

## Setup

```bash
corepack enable
pnpm install
```

## Development

```bash
pnpm build
pnpm test
pnpm check
```

`pnpm build` compiles every workspace package, `pnpm test` runs the Vitest
suite, and `pnpm check` validates formatting and lint rules with Biome.

## Workspace

- `packages/core` - the AgentForge facade and framework lifecycle
- `packages/plugin-sdk` - the public plugin contract
- `packages/shared` - shared framework utilities
- `tests` - repository-level tests

## Current state

This release establishes the framework foundation. Providers and integrations
for Ollama, Whisper, and Piper are not implemented yet.

## Plugin lifecycle

Plugins are registered before the framework starts. AgentForge initializes them
sequentially in registration order and shuts them down sequentially in reverse
order. Plugin names must be non-empty and unique.

```ts
import { AgentForge } from "@agentforge/core";
import type { Plugin } from "@agentforge/plugin-sdk";

const examplePlugin: Plugin = {
  name: "example",

  async initialize(context) {
    console.log(`Starting with AgentForge ${context.frameworkVersion}`);
  },

  async shutdown() {
    console.log("Stopping example plugin");
  },
};

const agent = new AgentForge();

agent.register(examplePlugin);

await agent.start();
await agent.stop();
```
