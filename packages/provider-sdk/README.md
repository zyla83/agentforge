<p align="center">
  <img src="../../asstets/brand/package-icons/provider-sdk.svg" alt="AgentForge provider SDK package icon" width="96" height="96">
</p>

# @agentforge/provider-sdk

Provider-neutral contracts shared by AgentForge runtimes and adapters. The
package defines provider metadata and health, LLM generation and streaming,
request cancellation and timeout options, registries, tool definitions, tool
calls, limited JSON Schema validation, results, and classified errors.

Concrete transports and wire formats do not belong in this package. Provider
implementations translate these contracts to their own APIs while preserving
immutability, cancellation, and deterministic error classification.

Tool definitions are serializable model-facing data. Executable handlers stay
separate and run only after explicit application registration and argument
validation.
