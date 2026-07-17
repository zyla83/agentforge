# AgentForge example tools

`@agentforge/example-tools` contains three deterministic, side-effect-free
examples: `calculator`, `format_text`, and `lookup_inventory`. Each export keeps
the model-facing definition separate from its executable handler.

```ts
import { registerExampleTools } from "@agentforge/example-tools";

registerExampleTools(agent);
```

The calculator accepts an operation plus two numbers and returns the computed
value as `{ operation, left, right, result }`. The formatter accepts
`{ values, format, separator?, trim? }` and returns the transformed values plus
their joined `text`; its handler defaults `separator` to `" "` and `trim` to
`true` because JSON Schema validation does not inject defaults. The inventory
lookup accepts `{ sku, includeWarehouses? }` and returns product availability,
with fresh nested warehouse data when requested.

These tools do not register or enable themselves. They perform no network,
filesystem, environment, time, or random operations and are not a privileged
standard library. Handler failures are intentionally left for AgentForge's
tool executor to convert into structured results.
