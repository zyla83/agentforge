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
- `packages/ollama-client` - low-level transport client for the Ollama REST API
- `packages/plugin-sdk` - the public plugin contract
- `packages/provider-mock` - deterministic in-memory LLM provider for tests and examples
- `packages/provider-ollama` - AgentForge LLM provider backed by Ollama
- `packages/provider-sdk` - base contracts for external capability providers
- `packages/shared` - shared framework utilities
- `examples/basic-agent` - runnable plugin lifecycle example
- `examples/ollama-agent` - optional live Ollama health and generation example
- `tests` - repository-level tests

## Current state

This release establishes the framework foundation and Ollama LLM integration.
Provider integrations for Whisper and Piper are not implemented yet.

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
providers extend this foundation.

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

## LLM provider contract

LLM providers accept conversation messages with `system`, `user`, and
`assistant` roles. Generation requests support temperature, top-p, token limit,
stop sequences, timeouts, and cancellation signals. Providers always support
complete responses and may additionally expose streaming. Use
`validateLLMGenerationRequest()` to validate requests received from runtime
callers.

```ts
import {
  LLMFinishReason,
  LLMMessageRole,
  healthyProvider,
  validateLLMGenerationRequest,
  type LLMGenerationRequest,
  type LLMGenerationResponse,
  type LLMProvider,
  type ProviderHealth,
} from "@agentforge/provider-sdk";

class ExampleLLMProvider implements LLMProvider {
  readonly metadata = {
    name: "example-llm",
    version: "1.0.0",
  };

  async checkHealth(): Promise<ProviderHealth> {
    return healthyProvider();
  }

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    validateLLMGenerationRequest(request);

    return {
      model: request.model,
      message: {
        role: LLMMessageRole.Assistant,
        content: "Example response",
      },
      finishReason: LLMFinishReason.Stop,
    };
  }
}
```

Tool calling is not implemented.

### Streaming LLM responses

Use the capability guard before calling `stream()`, because streaming is an
optional extension of the base LLM provider contract. Delta events contain
incremental text; one completed event contains the final normalized response.

```ts
import { isLLMStreamingProvider } from "@agentforge/provider-sdk";

if (isLLMStreamingProvider(provider)) {
  for await (const event of provider.stream(request)) {
    if (event.type === "delta") {
      process.stdout.write(event.delta);
    } else {
      console.log(event.response.finishReason);
    }
  }
}
```

The stream is lazy: validation and transport work begin when iteration starts.
Timeouts and `AbortSignal` cancellation apply for the stream's full lifetime.

## Mock LLM provider

Use `@agentforge/provider-mock` for deterministic tests, examples, and local
development without network access. It uses the same public SDK request
validator as other LLM providers and records immutable request snapshots for
later inspection.

```ts
import { MockLLMProvider } from "@agentforge/provider-mock";
import { LLMMessageRole } from "@agentforge/provider-sdk";

const provider = new MockLLMProvider({
  responseContent: "Deterministic response",
  streamDeltas: ["Deterministic ", "response"],
});

const response = await provider.generate({
  model: "test-model",
  messages: [{ role: LLMMessageRole.User, content: "Hello" }],
});

console.log(response.message.content);
console.log(provider.getRequests().length);
```

The mock supports configurable metadata, response content, deterministic stream
deltas, finish reason, and health results. It is not intended to simulate tool
calls, latency, model behavior, or network failures.

## Ollama HTTP client

`@agentforge/ollama-client` is a low-level client for the local Ollama REST API.
It uses `http://localhost:11434` by default, so Ollama must be running for real
requests.

```ts
import { OllamaClient } from "@agentforge/ollama-client";

const client = new OllamaClient();

const version = await client.getVersion();
const models = await client.listModels();

const response = await client.chat({
  model: "gemma3",
  messages: [
    {
      role: "user",
      content: "Hello",
    },
  ],
});

for await (const chunk of client.chatStream({
  model: "gemma3",
  messages: [{ role: "user", content: "Hello" }],
})) {
  if (chunk.message !== undefined) process.stdout.write(chunk.message.content);
}
```

Both complete and incrementally parsed NDJSON chat responses are supported.
Per-request cancellation uses `AbortSignal`, while connection, HTTP, response,
timeout, and cancellation failures use transport-specific errors. This client
remains the low-level transport used by the Ollama provider.

## Ollama LLM provider

Register `@agentforge/provider-ollama` when Ollama is installed and running and
the requested model already exists locally:

```ts
import { AgentForge } from "@agentforge/core";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import { LLMMessageRole } from "@agentforge/provider-sdk";

const agent = new AgentForge();

agent.registerLLMProvider(
  new OllamaLLMProvider({
    clientOptions: {
      baseUrl: "http://localhost:11434",
    },
  }),
  {
    default: true,
  },
);

const provider = agent.getDefaultLLMProvider();

const response = await provider?.generate({
  model: "llama3.1:8b",
  messages: [
    {
      role: LLMMessageRole.User,
      content: "Hello",
    },
  ],
});
```

Complete and streaming generation share the same AgentForge-to-Ollama request
mapping. Timeout and cancellation use provider request options, including for
the full stream lifetime. Transport errors are converted to provider SDK errors.
Registration does not perform a health check or download models automatically;
tool calling and automatic retries are not implemented.

Configure a model-aware health check when readiness requires a specific local
model:

```ts
const provider = new OllamaLLMProvider({
  clientOptions: {
    baseUrl: "http://localhost:11434",
  },
  healthCheck: {
    model: "llama3.1:8b",
  },
});

const health = await provider.checkHealth({
  timeoutMs: 5_000,
});
```

Without `healthCheck.model`, only `/api/version` is checked. With a model, the
provider also checks `/api/tags`: an exact, case-sensitive match is healthy, a
missing model is degraded, and an unreachable server is unavailable. Health
checks are explicit and are not triggered by registration. Models are never
downloaded automatically.

Run the optional live example after installing Ollama and the configured model:

```bash
pnpm example:ollama
```

Override its defaults with environment variables when needed:

```bash
OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1:8b pnpm example:ollama
```

The model must already be installed locally. Missing-model API responses are
commonly HTTP `404`; Ollama API errors use a JSON `error` property.

## Registering LLM providers

Register providers and select a default before starting AgentForge:

```ts
agent.registerLLMProvider(provider, {
  default: true,
});

const defaultProvider = agent.getDefaultLLMProvider();
```

Provider names are exact and case-sensitive. Metadata is validated and
snapshotted during registration, and no provider becomes the default
automatically. Plugins receive a read-only provider registry through
`PluginContext`. Registration is allowed only before startup and does not
perform a health check.

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
