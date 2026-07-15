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

## Run the example

```bash
pnpm install
pnpm build
pnpm example:basic
```

The basic example demonstrates ordered plugin initialization and reverse-order
shutdown.

## Workspace

- `packages/core` - the AgentForge facade and framework lifecycle
- `packages/plugin-sdk` - the public plugin contract
- `packages/provider-sdk` - base contracts for external capability providers
- `packages/shared` - shared framework utilities
- `examples/basic-agent` - runnable plugin lifecycle example
- `tests` - repository-level tests

## Current state

This release establishes the framework foundation. Providers and integrations
for Ollama, Whisper, and Piper are not implemented yet.

## Configuration

AgentForge validates configuration during construction and rejects unknown
top-level properties.

```ts
const agent = new AgentForge({
  instanceName: "desktop-assistant",
  plugins: {
    example: {
      enabled: true,
    },
  },
});
```

Plugin configuration is passed to its owning plugin as `unknown`. Each plugin
is responsible for validating its own configuration value.

## Logging

AgentForge provides a default Pino logger. Each plugin receives a child logger
through `PluginContext` and can attach structured context to a message.

```ts
async initialize(context) {
  context.logger.info("Plugin initialized", {
    featureEnabled: true,
  });
}
```

Consumers may provide their own `Logger`. Custom implementations must return a
valid `Logger` from `child()`.

```ts
const agent = new AgentForge(config, {
  logger: customLogger,
});
```

## Provider SDK

Providers supply external AI or infrastructure capabilities. The base Provider
SDK defines metadata, a standard health check, timeout declarations, and
platform-native cancellation signals. Concrete contracts such as LLM and speech
providers will extend this foundation in later releases.

```ts
import {
  healthyProvider,
  type Provider,
  type ProviderHealth,
  type ProviderRequestOptions,
} from "@agentforge/provider-sdk";

class ExampleProvider implements Provider {
  readonly metadata = {
    name: "example",
    version: "1.0.0",
  };

  async checkHealth(
    _options?: ProviderRequestOptions,
  ): Promise<ProviderHealth> {
    return healthyProvider("Example provider is ready.");
  }
}
```

Provider registration in `AgentForge` is not yet implemented.

## Plugin lifecycle

Plugins are registered before the framework starts. AgentForge initializes them
sequentially in registration order and shuts them down sequentially in reverse
order. Plugin metadata requires a unique, case-sensitive name and a Semantic
Versioning 2.0.0 version. A non-empty description is optional. AgentForge
validates and snapshots metadata during registration.

```ts
import { AgentForge } from "@agentforge/core";
import type { Plugin } from "@agentforge/plugin-sdk";

const examplePlugin: Plugin = {
  metadata: {
    name: "example",
    version: "1.0.0",
    description: "Demonstrates the AgentForge plugin lifecycle.",
  },

  async initialize(context) {
    context.logger.info("Plugin initialized");
  },

  async shutdown() {
    // Release plugin resources.
  },
};

const agent = new AgentForge();

agent.register(examplePlugin);

await agent.start();
await agent.stop();
```

## Inspecting registered plugins

The registry exposes validated metadata snapshots without exposing plugin
instances or mutable internal collections.

```ts
agent.hasPlugin("example");

const metadata = agent.getPluginMetadata("example");

const plugins = agent.getRegisteredPlugins();
```

Lookups are exact and case-sensitive. The returned list is read-only, preserves
registration order, and is available throughout the framework lifecycle.
