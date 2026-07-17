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

## Interactive chat CLI

The interactive example requires a local Ollama installation and demonstrates
durable filesystem-backed conversations, successful-turn persistence,
load/list/delete commands, and versioned conversation import/export. The system
prompt comes from an immutable agent profile.

```bash
ollama serve
ollama pull llama3.1:8b
pnpm example:chat
```

Override the model in POSIX-compatible shells:

```bash
OLLAMA_MODEL=qwen2.5:7b pnpm example:chat
```

PowerShell:

```powershell
$env:OLLAMA_MODEL = "qwen2.5:7b"
pnpm example:chat
```

The CLI saves data under `.agentforge/chat` by default. See the
[chat CLI README](examples/chat-cli/README.md) for its commands, data-directory
override, persistence semantics, and import/export format. Ctrl+C during
generation cancels the active response without saving partial output.

## Workspace

- `packages/core` - the AgentForge facade and framework lifecycle
- `packages/ollama-client` - low-level transport client for the Ollama REST API
- `packages/plugin-sdk` - the public plugin contract
- `packages/provider-mock` - deterministic in-memory LLM provider for tests and examples
- `packages/provider-ollama` - AgentForge LLM provider backed by Ollama
- `packages/provider-sdk` - base contracts for external capability providers
- `packages/shared` - shared framework utilities
- `packages/storage-filesystem` - durable Node.js conversation-store adapter
- `examples/basic-agent` - runnable plugin lifecycle example
- `examples/chat-cli` - interactive multi-turn Ollama chat application
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

## Tool contracts

`@agentforge/provider-sdk` defines provider-neutral, immutable contracts for
tool definitions, calls, results, asynchronous handlers, and execution context.
Definitions contain data only; executable handlers remain separate and are not
registered or invoked automatically in this release.

```ts
import {
  createToolDefinition,
  type ToolHandler,
} from "@agentforge/provider-sdk";

const definition = createToolDefinition({
  name: "current_time",
  description: "Return the current time for a UTC offset.",
  inputSchema: {
    type: "object",
    properties: {
      utcOffset: {
        type: "string",
        description: "UTC offset such as +02:00.",
      },
    },
    required: ["utcOffset"],
    additionalProperties: false,
  },
});

const handler: ToolHandler = async (argumentsValue, context) => {
  if (context.signal?.aborted) throw context.signal.reason;
  return { utcOffset: argumentsValue.utcOffset };
};
```

Arguments, metadata, outputs, and failure details accept deeply immutable JSON
values only. Tool inputs use a deliberately limited JSON Schema subset:
`object`, `array`, `string`, `number`, `integer`, `boolean`, and `null` types;
primitive `enum` and `const`; object `properties`, `required`, and
`additionalProperties`; array `items` and length limits; string length limits;
and numeric minimum/maximum limits. References, schema composition, patterns,
formats, conditionals, tuple schemas, and recursive schemas are not supported.

Argument validation against a registered definition, handler execution,
retries, timeouts, and provider wire-format mapping are intentionally deferred
to later tasks. Existing LLM request, response, conversation, and serialization
contracts do not carry tool data yet.

## Tool registry

Task-026 defines the provider-neutral tool contracts; the registry associates
those immutable definitions with handlers. Tools can be registered before
`AgentForge.start()` while the framework is in the `created` state. Names are
unique, exact, and case-sensitive, and listings preserve registration order.

```ts
const agent = new AgentForge().registerTool(definition, handler);

agent.hasTool("current_time");
agent.getToolDefinition("current_time");
agent.getRegisteredToolDefinitions();
```

`getTool()`, `requireTool()`, and `getRegisteredTools()` expose immutable
definition-handler associations to framework consumers. Plugins receive a
stable read-only `context.tools` view with the same lookup and listing methods,
but no registration method. Registration does not execute handlers or expose
tools to LLM providers; those integrations are deferred to later tasks.

## Conversation model

The core conversation model represents history as immutable snapshots. Appending
a message returns a new conversation, leaving every previous snapshot unchanged.
Roles reuse `LLMMessageRole`; IDs and timezone-aware timestamps are generated by
default.

```ts
import {
  appendConversationMessage,
  conversationToLLMMessages,
  createConversation,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";

let conversation = createConversation();

conversation = appendConversationMessage(conversation, {
  role: LLMMessageRole.User,
  content: "Hello",
});

const requestMessages = conversationToLLMMessages(conversation);
```

Conversion preserves role, content, and order while removing conversation-only
IDs and timestamps. Tests may inject deterministic ID generators and clocks into
the factory functions. The model does not execute providers or persist data.

## Conversation storage

Conversation persistence is explicit and remains separate from the stateless
conversation engine. The in-memory implementation stores deep immutable
snapshots for the current process only; it is not durable across restarts.

```ts
import {
  createConversation,
  createInMemoryConversationStore,
} from "@agentforge/core";

const store = createInMemoryConversationStore();

const result = await engine.runTurn({
  conversation: createConversation(),
  content: "Hello",
});

const saved = await store.save(result.conversation);
const loaded = await store.require(saved.conversation.id);
```

Each successful save increments the current entry's per-conversation revision
and records a separate `savedAt` timestamp. `get` returns `undefined` when an ID
is absent, while `require` throws a typed not-found error. `list` provides a
deterministic paginated view ordered by conversation update time; `delete` and
`clear` remove entries. Saving an ID after deletion starts again at revision 1
because historical revisions and tombstones are not retained.

All loaded conversations and list results are immutable snapshots. Future
database adapters can implement the same `ConversationStore` interface without
changing conversation execution.

For durable Node.js persistence, install and import the adapter explicitly:

```ts
import { createFilesystemConversationStore } from "@agentforge/storage-filesystem";

const store = createFilesystemConversationStore({
  directory: "./agentforge-data",
});

const result = await engine.runTurn({
  conversation,
  content: "Hello",
});

await store.save(result.conversation);
```

Core owns the environment-neutral storage contract; the filesystem package owns
Node-specific durable storage. Engine execution never saves automatically.

## Conversation serialization

Conversation documents use the explicit `agentforge.conversation` kind and V1
schema version. Serialization produces deterministic JSON in compact form by
default or with standard two-space indentation when `pretty` is enabled.

```ts
const serialized = serializeConversation(conversation, {
  pretty: true,
});

const restored = deserializeConversation(serialized);
```

Decoders validate untrusted strings and already parsed unknown values. Malformed
JSON, invalid document structure, and unsupported future versions produce
distinct typed errors. Restored conversations are deeply immutable snapshots.

Conversation-store entries use the separate
`agentforge.conversation-store-entry` V1 envelope and preserve persistence
metadata:

```ts
const saved = await store.save(conversation);
const serializedEntry = serializeConversationStoreEntry(saved);
const restoredEntry = deserializeConversationStoreEntry(serializedEntry);
```

Serialization does not read or write files. The serialized schema is a
compatibility boundary and is intentionally separate from runtime interfaces.

## Conversation engine

The stateless conversation engine orchestrates one immutable user-to-assistant
turn. It resolves the default or an explicitly named provider, while leaving the
source conversation unchanged.

```ts
const engine = agent.createConversationEngine();
const source = createConversation();

const result = await engine.runTurn({
  conversation: source,
  content: "Hello",
  model: "example-model",
});
```

Streaming execution is lazy and emits a user-appended `started` snapshot,
accumulated deltas, and one final immutable conversation after the provider ends
cleanly.

```ts
for await (const event of engine.streamTurn({
  conversation: result.conversation,
  content: "Continue",
  model: "example-model",
})) {
  if (event.type === "delta") process.stdout.write(event.delta);
}
```

The conversation model stores immutable history; the conversation engine
orchestrates provider execution for one turn. Provider failures reject execution,
and persistence is not included.

## Agent profiles and system prompts

Agent profiles are immutable, reusable execution configuration. A profile has a
stable ID and system prompt, and may provide model, provider, and generation
defaults.

```ts
const profile = createAgentProfile({
  id: "concise",
  systemPrompt: "Answer concisely.",
  model: "llama3.1:8b",
  provider: "ollama",
});

const engine = agent.createConversationEngine({ profile });
const result = await engine.runTurn({
  conversation: createConversation(),
  content: "Explain AgentForge.",
});
```

The profile system prompt is prepended only to provider requests and is never
stored in conversation history. A per-turn profile fully replaces the engine
default profile. Explicit turn model and provider values override profile
defaults. Generation settings merge property by property, while turn stop
sequences replace profile stop sequences instead of being concatenated.

Conversations are immutable user-visible history. Agent profiles provide
reusable execution defaults and system instructions. The conversation engine
combines both when calling a provider. Profiles are not persisted or registered
globally.

## Cancelling conversation turns

Conversation cancellation uses native `AbortSignal`. Pass a per-turn signal
through `request.signal`, or provide an engine-wide signal when creating the
engine. Either signal cancels execution.

```ts
const controller = createConversationTurnController();
const engine = agent.createConversationEngine({
  signal: controller.signal,
});

const turn = engine.runTurn({
  conversation: createConversation(),
  content: "Explain cancellation.",
  model: "example-model",
});

controller.abort(new Error("Application shutdown"));
await turn;
```

The helper is optional. A native controller works for individual turns:

```ts
const controller = new AbortController();

await engine.runTurn({
  conversation: createConversation(),
  content: "Hello",
  model: "example-model",
  request: {
    signal: controller.signal,
    timeoutMs: 10_000,
  },
});
```

Cancellation rejects the promise or async iterator and never stores a partial
assistant message. An already-aborted signal takes precedence over turn
validation. Provider-generated abort errors remain provider errors, while core
checkpoints use execution-phase diagnostics. Breaking out of a stream as a
consumer is cleanup, not cancellation. Request timeouts remain provider-owned
through `timeoutMs`.

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
