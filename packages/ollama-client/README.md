<p align="center">
  <img src="../../asstets/brand/package-icons/ollama-client.svg" alt="AgentForge Ollama client package icon" width="96" height="96">
</p>

# @agentforge/ollama-client

A typed HTTP client for local Ollama APIs. It covers version and model
inspection, complete chat requests, NDJSON streaming, and Ollama tool-calling
wire contracts.

```ts
import { OllamaClient } from "@agentforge/ollama-client";

const client = new OllamaClient();
const version = await client.getVersion();
```

The client classifies connection, HTTP, response, timeout, and cancellation
failures. It does not start Ollama, install models, probe model capabilities, or
retry requests automatically.
