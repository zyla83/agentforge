# Ollama agent example

This optional live example verifies an installed Ollama server through
`@agentforge/provider-ollama`. It performs a model-aware health check and a real
generation request, so its output depends on the selected model and is not
deterministic.

## Requirements

- A running local Ollama server
- The configured model installed locally
- Network access only to the configured Ollama endpoint

## Run

```bash
ollama serve
ollama pull <model>
pnpm build
pnpm example:ollama
```

Set the model and endpoint with the environment variables documented by the
example's startup error. A successful run reports provider health and prints a
generated response. If Ollama is unavailable or the model is missing, the
example exits with a typed, actionable provider error. It does not download or
remove models and creates no conversation storage.
