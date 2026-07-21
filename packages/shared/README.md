<p align="center">
  <img src="../../asstets/brand/package-icons/shared.svg" alt="AgentForge shared package icon" width="96" height="96">
</p>

# @agentforge/shared

Small dependency-light primitives shared across AgentForge packages. The public
surface currently includes typed result values and base framework errors used
at package boundaries.

```ts
import type { Result } from "@agentforge/shared";
```

Domain-specific provider, storage, lifecycle, and tool errors remain in the
packages that own those behaviors.
