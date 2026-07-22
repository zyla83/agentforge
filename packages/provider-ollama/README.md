<p align="center">
  <img src="../../asstets/brand/package-icons/provider-ollama.svg" alt="AgentForge Ollama provider package icon" width="96" height="96">
</p>

# @agentforge/provider-ollama

The AgentForge LLM provider adapter for Ollama. It maps provider-neutral
generation, streaming, health, cancellation, and tool contracts to the
Ollama-specific client and wire format.

```ts
import { OllamaLLMProvider } from "@agentforge/provider-ollama";

const provider = new OllamaLLMProvider({
  healthCheck: { model: "llama3.1:8b" },
});
```

Ollama must be installed and running separately. Declared adapter support for
tools does not prove that every installed model can produce valid tool calls.
See the canonical
[Ollama installation and environment setup](../../docs/INSTALLATION.md#optional-ollama-installation).
