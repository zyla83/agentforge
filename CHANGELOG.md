# Changelog

## v0.1.0 (work in progress)

### Added
- Core package
- Plugin SDK
- Shared package
- Basic tests
- Predictable plugin registration, startup, rollback, and shutdown lifecycle
- Public framework states and focused lifecycle error types
- Runnable basic example demonstrating the plugin lifecycle
- Public `AGENTFORGE_VERSION` runtime version constant
- `@agentforge/config` package with validated instance configuration
- Per-plugin configuration values exposed through `PluginContext`
- `@agentforge/logger` package with a default Pino implementation
- Framework and plugin-specific child loggers with custom logger support
- Structured plugin metadata with Semantic Versioning validation
- Registration-time metadata snapshots and plugin versions in logger bindings
- Exact plugin lookup, registration checks, and ordered read-only metadata listing
- `@agentforge/provider-sdk` package with base provider and metadata contracts
- Immutable provider health results and status helpers
- Provider request options with timeout validation and native abort checks
- Provider-specific error hierarchy with cause preservation
- Provider-independent `LLMProvider` contract with conversation message roles
- LLM generation requests, responses, parameters, and immutable token usage
- Deterministic runtime validation with aggregated LLM request details
- LLM provider registration with explicit default-provider selection
- Ordered read-only LLM provider registry exposed through `PluginContext`
- `@agentforge/provider-mock` package with deterministic LLM responses and configurable health results
- Immutable mock request history for inspecting validated generation calls
- Basic example generation through the registered default mock LLM provider
- `@agentforge/ollama-client` transport client for server version, model listing, and non-streaming chat
- Ollama request timeouts, `AbortSignal` cancellation, and structured transport errors
- `@agentforge/provider-ollama` package with AgentForge-to-Ollama request mapping
- Ollama response, finish-reason, token-usage, provider-error, and health-check mapping
- Model-aware Ollama health checks with immutable structured details
- Degraded health status for missing required models and an optional live Ollama example
- Provider-independent LLM delta and completion streaming contracts with runtime capability detection
- Deterministic mock LLM streaming with validated configurable deltas
- Incremental Ollama NDJSON chat streaming with lifetime timeout and cancellation handling
- Streaming Ollama provider mapping, registry examples, and live incremental output
