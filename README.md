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
