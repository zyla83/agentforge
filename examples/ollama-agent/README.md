<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../asstets/brand/agentforge-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="../../asstets/brand/agentforge-logo-light.svg">
    <img src="../../asstets/brand/agentforge-logo-light.svg" alt="AgentForge" width="420">
  </picture>
</p>

# Ollama agent example

This optional live example verifies an installed Ollama server through
`@agentforge/provider-ollama`. It performs a model-aware health check and a real
generation request, so its output depends on the selected model and is not
deterministic.

## Requirements

- A running local Ollama server
- The configured model installed locally
- Network access only to the configured Ollama endpoint

Ollama is installed separately and is not required for deterministic examples
or CI. Follow the canonical
[Ollama installation and environment setup](../../docs/INSTALLATION.md#optional-ollama-installation).

## Run

Replace `<model>` consistently with the exact installed model name shown by
`ollama list`.

POSIX-compatible shell:

```bash
ollama pull <model>
pnpm build
OLLAMA_MODEL="<model>" pnpm example:ollama
```

PowerShell:

```powershell
ollama pull <model>
pnpm build
$env:OLLAMA_MODEL = "<model>"
pnpm example:ollama
```

`OLLAMA_MODEL` selects the model, and `OLLAMA_BASE_URL` overrides the default
endpoint. See the canonical
[environment variable reference](../../docs/INSTALLATION.md#environment-variable-reference).
A successful run reports provider health and prints a generated response. If
Ollama is unavailable or the model is missing, the example exits with a typed,
actionable provider error. It does not download or remove models and creates no
conversation storage.
