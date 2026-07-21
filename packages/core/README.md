<p align="center">
  <img src="../../asstets/brand/package-icons/core.svg" alt="AgentForge core package icon" width="96" height="96">
</p>

# @agentforge/core

The AgentForge runtime and orchestration package. It provides the framework
facade, deterministic plugin lifecycle, provider and tool registration,
immutable conversations and profiles, multi-round conversation execution,
serialization, and conversation-store contracts.

```ts
import { AgentForge } from "@agentforge/core";

const agent = new AgentForge();
await agent.start();
await agent.stop();
```

Provider-neutral contracts remain in `@agentforge/provider-sdk`; concrete
providers and storage adapters live in their own packages. Tool handlers run
with the host application's privileges and are not sandboxed by AgentForge.
