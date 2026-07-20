# AgentForge 0.1.0 MVP Release

AgentForge 0.1.0 is the first MVP baseline for building offline-first local AI
agents in TypeScript. This document records the verification for its final
GitHub source release. It is not a production-security claim, and the source
release does not publish npm packages.

## Supported capabilities

- Framework and plugin lifecycle, configuration, logging, and immutable profiles
- Provider-neutral complete, streaming, health, error, and tool contracts
- Deterministic mock provider plus local Ollama client and provider adapter
- Immutable conversations, cancellation, bounded multi-round orchestration
- Versioned V1/V2 conversation serialization and local filesystem persistence
- Validated tool registration/execution, structured failures, and example tools
- Ollama tool calling, opt-in CLI tools, observability, and observer redaction
- Deterministic examples and automated repository-wide regression tests

## Required verification

The local and CI release-readiness gate is:

```bash
pnpm install --frozen-lockfile
pnpm verify:mvp
```

`verify:mvp` checks formatting and lint, builds every workspace package, runs
the complete test suite and both deterministic examples, then validates all
public package entry points through a private workspace consumer. The consumer
uses normal package-name resolution for TypeScript declarations and runtime
exports, so it exercises package manifests without direct source or `dist`
paths. This is a workspace consumer check, not a packed-tarball or registry
installation test. It does not require Ollama or network model downloads.

## Manual Ollama smoke test

The release run completed these checks on 2026-07-20 with Windows
10.0.26200.8875, Node.js 22.14.0, pnpm 11.12.0, Ollama 0.32.1, and the installed
`llama3.1:8b` model.

Text-only:

- [x] Start Ollama and select the installed `llama3.1:8b` model.
- [x] Run `corepack pnpm example:chat` with `AGENTFORGE_CHAT_TOOLS=off`.
- [x] Confirm a normal streamed answer.
- [x] Cancel a long response with one physical `Ctrl+C` and confirm the CLI
  returns to the prompt without exiting.
- [x] Complete a subsequent turn, save and reload the conversation, and confirm
  the cancelled prompt and partial assistant output were not persisted.

Tool-enabled:

- [x] Use Ollama 0.32.1 with the installed `llama3.1:8b` model.
- [x] Run `corepack pnpm example:chat` with
  `AGENTFORGE_CHAT_TOOLS=example`.
- [x] Request `144 / 12` and confirm exactly one successful `calculator`
  execution and a final answer of `12`.
- [x] Complete a subsequent turn and exit cleanly.
- [x] Save and reload the V2 conversation and confirm the correlated tool call
  and result remain present.

Model tool support is not part of the standard provider health check and is not
inferred from the adapter capability flag.

## Known limitations

- Ollama is the only real LLM provider and model tool support varies.
- No dynamic model probing, voice I/O, Windows tools, GUI, or distributed runtime
- No confirmation, permissions, sandbox, automatic retry, transaction, or rollback
- Filesystem storage is local and does not coordinate multi-process writers
- Root `AgentForge` configuration rejects unknown keys; several lower-level
  constructor option objects validate supported values but do not promise strict
  rejection of extra runtime properties during the 0.x series
- APIs may evolve during the 0.x series before 1.0.0

## Safety assumptions

Applications register all executable tool handlers and remain responsible for
least privilege, allowlists, destructive-action confirmation, secrets, and data
retention. AgentForge validates tool arguments but does not sandbox handlers.
Tool handlers are not automatically retried, completed side effects are not
rolled back, and persisted conversations may contain sensitive tool data.
Observer redaction does not alter model-visible or persisted values.

## Release checklist

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm verify:mvp`
- [x] Complete the manual Ollama text chat, cancellation, persistence, and exit
  smoke test.
- [x] Complete the manual Ollama tool-call and V2 persistence smoke test.
- [x] Review the changelog for the 0.1.0 baseline.
- [x] Review workspace package versions.
- [x] Confirm a clean working tree after automated verification.
- [x] Confirm package-registry publication remains explicitly deferred.
- [x] Prepare the authorized source-release commit; tag creation remains gated
  on successful GitHub Actions for that exact commit and is verified externally.

The source-release checklist does not assert that the annotated tag or GitHub
Release exists before the exact-commit CI gate completes.

## Publication readiness

All library packages build JavaScript, declarations, declaration maps, and
source maps and expose a root entry through `main` and `types`. Package versions
are consistently 0.1.0 and examples remain private. Publication is intentionally
deferred: most package manifests currently whitelist only `dist`, package-level
README coverage is incomplete, and repository/homepage/bugs/author metadata has
not been declared consistently. The root MIT license is established, but its
packaging must be reviewed before publishing. No registry credentials or publish
operation are part of the MVP gate. The GitHub source release does not publish
these packages to npm.

## Post-MVP work

Capability-oriented tracks include desktop tools, voice I/O, confirmation and
permission policy, additional providers, logging exporters, package publication,
graphical interfaces, and remote/distributed execution.
