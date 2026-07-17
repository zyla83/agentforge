# AgentForge

AgentForge is a TypeScript framework for composing offline-first, local AI
agents from explicit providers, conversations, plugins, storage adapters, and
validated application tools.

## Status

AgentForge 0.1.0 is an MVP candidate. The deterministic examples and automated
test suite run without Ollama; live generation requires a local Ollama server.
The framework supplies orchestration infrastructure, while applications own
their tool handlers, permissions, and safety policy.

AgentForge follows semantic versioning, but APIs may evolve during the 0.x
series. Version 0.1.0 is the first MVP baseline, not a production-readiness or
formal security claim.

## What the MVP supports

- Plugin lifecycle, immutable metadata, configuration, and structured logging
- Provider-neutral LLM, streaming, health, tool, and error contracts
- Deterministic mock generation plus a real local Ollama adapter
- Immutable agent profiles, conversations, and multi-turn orchestration
- Cancellation, bounded tool rounds, and complete/streaming parity
- In-memory and durable local filesystem conversation stores
- Versioned V1/V2 persistence, import, and export
- Validated tool registration, execution, structured failures, and examples
- Ollama tool-call mapping and opt-in tool-enabled chat
- Immutable tool execution observations and observer-only redaction
- Bounded single-line terminal previews hardened against control sequences

## What the MVP does not support

The MVP does not include voice I/O, Windows control tools, arbitrary shell
execution, automatic tool retries, confirmation or permission engines,
sandboxing, transactions or rollback, remote/distributed execution, a GUI,
additional real LLM providers, or telemetry exporters.

## Requirements

- Node.js 22 or newer
- pnpm 11.12.0 through Corepack
- Ollama only for live Ollama examples and the interactive chat

## Installation

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

## Quick start

These deterministic examples require no network service:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm example:basic
pnpm example:tools
```

`example:basic` demonstrates configuration, plugins, mock complete and streaming
turns, profiles, and cancellation. `example:tools` demonstrates a deterministic
two-round tool call, validated local execution, structured results, and
observer events.

The basic public API is package-root based:

```ts
import {
  AgentForge,
  createAgentProfile,
  createConversation,
} from "@agentforge/core";
import { MockLLMProvider } from "@agentforge/provider-mock";

const agent = new AgentForge();
agent.registerLLMProvider(new MockLLMProvider(), { default: true });
const profile = createAgentProfile({
  id: "assistant",
  systemPrompt: "Be concise and accurate.",
  model: "mock-model",
});

const result = await agent.createConversationEngine({ profile }).runTurn({
  conversation: createConversation(),
  content: "Hello",
});

console.log(result.assistantMessage.content);
```

## Interactive chat

Install Ollama, select any installed model appropriate for your use case, then:

```bash
ollama serve
ollama pull <model>
pnpm build
pnpm example:chat
```

Configure the model with `OLLAMA_MODEL`; the default is documented by the chat
example. Text-only mode is the default and can be explicit.

POSIX-compatible shells:

```bash
OLLAMA_MODEL=<model> AGENTFORGE_CHAT_TOOLS=off pnpm example:chat
```

PowerShell:

```powershell
$env:OLLAMA_MODEL = "<model>"
$env:AGENTFORGE_CHAT_TOOLS = "off"
pnpm example:chat
```

Conversation files default to `.agentforge/chat` and support `/save`, `/list`,
`/load`, `/delete`, `/export`, and `/import`. Use `/help` for the exact command
syntax. Expected user errors are rendered without raw stack traces.

## Tool-enabled chat

The bundled `calculator`, `format_text`, and `lookup_inventory` tools are
enabled only when requested. The selected model must support Ollama tool calls;
adapter support does not guarantee model support.

POSIX-compatible shells:

```bash
OLLAMA_MODEL=<tool-capable-model> AGENTFORGE_CHAT_TOOLS=example pnpm example:chat
```

PowerShell:

```powershell
$env:OLLAMA_MODEL = "<tool-capable-model>"
$env:AGENTFORGE_CHAT_TOOLS = "example"
pnpm example:chat
```

The CLI reports tool start and completion, sends structured results back to the
model, and persists completed V2 tool history. Invalid tool mode values are
rejected with the valid `off` and `example` values. Tool mode cannot be changed
during a running CLI session.

## Architecture

```text
Application
  -> AgentForge
  -> ConversationEngine
  -> LLM provider
  -> provider tool calls
  -> ToolRegistry / ToolExecutor
  -> model-visible tool results
  -> final assistant response
  -> conversation persistence
```

The provider SDK owns provider-neutral contracts. Core owns registration and
orchestration. Provider adapters own wire mapping. Storage adapters own durable
persistence. Applications own executable handlers and their safety policy.
Core does not depend on Ollama or filesystem adapters.

## Workspace packages

Publishable library packages:

- `@agentforge/config` — validated framework configuration
- `@agentforge/core` — lifecycle, registries, conversations, tools, and orchestration
- `@agentforge/example-tools` — deterministic reusable tool examples
- `@agentforge/logger` — framework logging abstraction and Pino implementation
- `@agentforge/ollama-client` — low-level Ollama HTTP and streaming client
- `@agentforge/plugin-sdk` — plugin contracts and context
- `@agentforge/provider-mock` — deterministic test and example LLM provider
- `@agentforge/provider-ollama` — provider-neutral Ollama LLM adapter
- `@agentforge/provider-sdk` — provider, LLM, streaming, health, and tool contracts
- `@agentforge/shared` — shared result and error primitives
- `@agentforge/storage-filesystem` — durable Node.js conversation store

Private examples:

- `@agentforge/example-basic` — deterministic framework and mock-provider tour
- `@agentforge/example-chat-cli` — live persistent Ollama chat
- `@agentforge/example-ollama` — live Ollama health and generation check
- `@agentforge/example-tool-execution` — deterministic multi-round tool execution

## Core concepts

`AgentForge` owns lifecycle state and exact, case-sensitive registration for
plugins, profiles, LLM providers, and tools. Registration snapshots public
metadata. Read-only registries expose immutable views without leaking handlers
or internal collections.

An `AgentProfile` combines a reusable system prompt with optional model,
provider, and generation defaults. System prompts are provider input and are not
stored as conversation messages. A `ConversationEngine` is stateless with
respect to storage: callers pass a conversation snapshot and receive a new one.

Cancellation uses `AbortSignal` and typed conversation errors. A failed or
aborted partial turn does not produce a completed conversation snapshot for the
application to persist.

## Providers

`@agentforge/provider-sdk` defines neutral complete/streaming generation,
health, request options, errors, and tool contracts. `MockLLMProvider` is fully
deterministic. `OllamaLLMProvider` maps those contracts to a local Ollama server
and exposes adapter capabilities without probing a model dynamically.

Request validation problems use `ProviderRequestError`; invalid provider output
uses `ProviderResponseError`; timeout, abort, and unavailability remain distinct.
Automated tests use fakes and do not require a live server.

## Conversations and persistence

Conversations and messages are immutable snapshots. The in-memory store supports
revisioned save/load/list/delete behavior. `@agentforge/storage-filesystem`
persists versioned store-entry documents using safe Base64URL filenames,
same-directory temporary writes, flush, and rename. V1 text history and V2 tool
history remain readable.

Filesystem persistence is local and does not coordinate multi-process writes.
Tool-enabled history may contain arguments, outputs, failure details, and model
responses derived from them. Import only trusted documents and apply an
application-specific retention and access policy.

## Tool calling

Tool definitions use a limited provider-neutral JSON Schema. The executor
validates arguments before invoking a registered handler, snapshots JSON-compatible
results, converts expected failures into structured tool results, and executes
calls sequentially in provider order.

A complete tool-enabled turn is:

```text
user message -> provider request -> provider tool call -> argument validation
-> local handler -> tool result -> next provider round -> assistant answer
-> successful application persistence
```

Tools are disabled by default. Enable bounded orchestration explicitly:

```ts
import { AgentForge, createConversation } from "@agentforge/core";
import { registerExampleTools } from "@agentforge/example-tools";

const agent = new AgentForge();
registerExampleTools(agent);

const engine = agent.createConversationEngine({
  toolExecution: { enabled: true, maxRounds: 8 },
});

await engine.runTurn({
  conversation: createConversation(),
  content: "What is 7 multiplied by 6?",
  model: "tool-capable-model",
});
```

No automatic handler retry or rollback occurs. When the round limit is reached,
no additional calls execute and the existing typed conversation error is
surfaced; completed side effects remain completed.

## Observability and redaction

Tool observers receive immutable, correlated start and completion events.
Without a redactor, payloads contain full canonical arguments and results.
Applications can configure observer-only redaction:

```ts
import type { ToolExecutionRedactor } from "@agentforge/core";

const redactor: ToolExecutionRedactor = {
  redactArguments(argumentsValue) {
    return Object.fromEntries(
      Object.entries(argumentsValue).map(([key, value]) =>
        /token|password|secret/i.test(key)
          ? [key, "[REDACTED]"]
          : [key, value],
      ),
    );
  },
};

const engine = agent.createConversationEngine({
  observability: { toolExecution: handleToolEvent, redactor },
});
```

Redaction runs once before ordered observer dispatch. Exceptions, invalid
returns, promises, rejected promises, and hostile thenables are isolated.
Fallback observer arguments are `{}`; successful output becomes `null`; failed
results keep their code, remove details, and use a generic message.

Redaction does not alter handler data, model-visible results, execution records,
stream events, or persisted history. CLI sanitization prevents multiline and
ANSI/control-sequence injection but is not secret redaction.

## Safety model

- Only registered tools can execute, and arguments are validated first.
- Tool handlers are application code and run with the application's privileges.
- Prefer narrow tools and strict allowlists; avoid unrestricted shell handlers.
- Classify tools as read-only, idempotent write, or non-idempotent write.
- Confirm destructive/high-impact actions in the application before execution.
- AgentForge provides no sandbox, permission engine, or formal security boundary.
- Tool handlers are not automatically retried and side effects are not rolled back.
- Persisted conversations and execution records may contain sensitive values.

## Development

```bash
pnpm check
pnpm build
pnpm test
```

Run the complete deterministic MVP gate locally:

```bash
pnpm verify:mvp
```

The command performs formatting/lint checks, all builds and tests, both
deterministic examples, and built-package API smoke checks. It does not start
Ollama or download a model. See [MVP readiness](docs/MVP.md) for the release and
optional manual smoke-test checklists.

## Testing

The Vitest suite covers lifecycle, configuration, profiles, provider contracts,
complete and streaming conversations, cancellation, storage, serialization,
tools, Ollama mapping, CLI behavior, observability, redaction, and terminal
hardening. Tests use deterministic providers, fake transports, isolated
temporary directories, and restored global state.

## Current limitations

- Ollama is the only implemented real LLM provider.
- Tool compatibility varies by installed model and Ollama version.
- There is no dynamic model capability probing or hardcoded model allowlist.
- There is no voice, Windows tool library, confirmation/permission engine,
  retry engine, sandbox, transaction rollback, distributed execution, or GUI.
- Filesystem storage is local and single-process oriented.
- Package publication metadata/documentation still requires a release review.
- APIs may evolve before 1.0.0.

## Roadmap after MVP

Future capability tracks include desktop tools, voice I/O, permission and
confirmation policy, additional providers, structured logging exporters,
package publication, graphical interfaces, and remote/distributed execution.
These are outside the 0.1.0 MVP baseline.

## License

AgentForge is licensed under the MIT License. See [LICENSE](LICENSE).
