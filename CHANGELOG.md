# Changelog

## Unreleased

### Added

- Spotify Authorization Code with PKCE, refresh-token rotation, and immutable
  current-playback inspection through `@agentforge/spotify-client`
- Opt-in `AGENTFORGE_CHAT_TOOLS=spotify` mode with the read-only
  `spotify_get_current_playback` tool

### Security

- Spotify authentication uses a temporary loopback-only callback and no client
  secret, but the persisted refresh credential remains sensitive plaintext and
  is not protected by an AgentForge credential vault
- Normalized playback data may reveal listening activity and device metadata and
  may be visible to the model or persisted in conversation history

## v0.1.0 (2026-07-20)

The first AgentForge MVP baseline.

### Added

- Framework and plugin lifecycle with validated configuration, structured logging,
  immutable metadata snapshots, read-only registries, and focused lifecycle errors
- Immutable agent profiles with reusable system prompts and generation defaults
- Provider-neutral health, request, error, complete generation, streaming, and tool contracts
- Exact LLM provider registration with default selection and plugin-context inspection
- Deterministic mock LLM provider with complete/streaming responses and request history
- Low-level Ollama HTTP client for version, models, complete chat, NDJSON streaming,
  timeout, abort, transport errors, and provider-neutral tool wire structures
- Ollama LLM provider with request/response mapping, health checks, model requirements,
  token usage, streaming, cancellation, and tool calling
- Immutable conversations, messages, IDs, chronology validation, and LLM conversion
- Complete and streaming conversation engine with profiles, provider selection,
  cancellation, bounded multi-round tools, and immutable turn results
- In-memory conversation storage with revisioning, pagination, and typed errors
- Versioned V1/V2 conversation and store-entry serialization with safe unknown decoding
- Durable Node.js filesystem storage with safe filenames, temporary writes, flush,
  rename, restart persistence, corruption detection, and V1/V2 compatibility
- Provider-neutral tool definitions, limited JSON Schema inputs, calls, handlers,
  results, execution context, registry, validation, and structured failures
- Sequential tool execution and opt-in multi-round orchestration for complete and
  streaming turns
- Deterministic calculator, text-formatting, and inventory example tools
- Interactive local Ollama chat with streaming, cancellation, durable persistence,
  save/list/load/delete/import/export commands, and opt-in example tools
- Synchronous immutable tool execution observer events with correlation, timing,
  ordered dispatch, exception isolation, and execution records
- Observer-only argument and result redaction with immutable validated snapshots
- Deterministic basic and multi-round tool examples that require no Ollama
- MVP readiness documentation, package-root import checks, built-package smoke checks,
  and a complete `pnpm verify:mvp` local/CI gate

### Changed

- Tool-enabled conversations use V2 persistence while V1 text history remains readable
- The chat CLI remains text-only by default and enables bundled tools only through
  `AGENTFORGE_CHAT_TOOLS=example`
- Root documentation now presents the supported MVP, architecture, safety model,
  deterministic quick start, live Ollama workflow, limitations, and post-MVP roadmap
- CI now runs the complete deterministic MVP verification command on Node.js 22

### Fixed

- Interactive readline `SIGINT` now reaches active-response cancellation on Windows
- Ollama tool responses accept validated `id` and function `index` metadata
  without changing provider-neutral call IDs
- MVP package smoke checks now resolve TypeScript and runtime imports through real
  workspace package manifests instead of direct `dist` paths
- Semantic version validation rejects whitespace and underscores
- Unknown provider names consistently use the `<unknown>` fallback
- Ollama health checks reject unsafe base URLs and preserve model-aware status
- Streaming completion is emitted only after the transport ends cleanly
- Chat CLI renders completed responses when a provider emits no deltas
- Invalid complete and streaming Ollama output uses `ProviderResponseError`
- Unsupported rejected redactor promises and hostile thenables cannot cause
  unhandled rejections or alter tool execution

### Security

- Tool observer redactor failures use non-sensitive fallback payloads without
  changing handler inputs, model-visible results, records, or persisted history
- Chat CLI tool previews are bounded, single-line, Unicode-aware, and strip ANSI,
  C0, and DEL terminal controls
- Documentation distinguishes terminal sanitization, observer redaction, persisted
  sensitive data, side-effect classes, destructive-action confirmation, and retry risk
- No unrestricted shell tool, sandbox guarantee, automatic retry, or rollback is implied

### Known limitations

- Ollama is the only implemented real LLM provider and model tool support varies
- No dynamic model probing, voice I/O, Windows tools, confirmation/permission engine,
  sandbox, automatic retry, transaction rollback, distributed runtime, or GUI
- Filesystem storage is local and does not coordinate multi-process writers
- Package publication metadata and per-package documentation require a separate review
- Public APIs may evolve during the 0.x series before 1.0.0
