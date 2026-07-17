# AgentForge 0.1.0 MVP Readiness

AgentForge 0.1.0 is the first MVP baseline for building offline-first local AI
agents in TypeScript. It is an MVP candidate, not a published release or a
production-security claim.

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
the complete test suite, runs both deterministic examples, type-checks public
package-root imports, and imports selected runtime exports from built packages.
It does not require Ollama or network model downloads.

## Manual Ollama smoke test

These checks are optional for commits but required before describing a release
candidate as manually verified against Ollama.

Text-only:

- [ ] Start Ollama and select an installed model.
- [ ] Run the chat CLI with `AGENTFORGE_CHAT_TOOLS=off`.
- [ ] Send a normal prompt and confirm a streamed answer.
- [ ] Cancel one response and confirm the conversation remains usable.

Tool-enabled:

- [ ] Select a model and Ollama version that support tool calling.
- [ ] Run the chat CLI with `AGENTFORGE_CHAT_TOOLS=example`.
- [ ] Request a deterministic calculation.
- [ ] Confirm tool start and completion lines and the final assistant answer.
- [ ] Reload the conversation and confirm V2 tool history persists.

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
- [ ] Complete the manual Ollama text chat smoke test.
- [ ] Complete the manual Ollama tool-call smoke test.
- [x] Review the changelog for the 0.1.0 baseline.
- [x] Review workspace package versions.
- [x] Confirm a clean working tree after automated verification.
- [ ] Decide publication metadata and package documentation policy.
- [ ] Create a release commit/tag only through a separately authorized process.

Manual items remain unchecked because the automated MVP gate does not run a live
Ollama server or publish packages.

## Publication readiness

All library packages build JavaScript, declarations, declaration maps, and
source maps and expose a root entry through `main` and `types`. Package versions
are consistently 0.1.0 and examples remain private. Publication is intentionally
deferred: most package manifests currently whitelist only `dist`, package-level
README coverage is incomplete, and repository/homepage/bugs/author metadata has
not been declared consistently. The root MIT license is established, but its
packaging must be reviewed before publishing. No registry credentials or publish
operation are part of the MVP gate.

## Post-MVP work

Capability-oriented tracks include desktop tools, voice I/O, confirmation and
permission policy, additional providers, logging exporters, package publication,
graphical interfaces, and remote/distributed execution.
