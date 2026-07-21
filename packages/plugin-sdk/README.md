<p align="center">
  <img src="../../asstets/brand/package-icons/plugin-sdk.svg" alt="AgentForge plugin SDK package icon" width="96" height="96">
</p>

# @agentforge/plugin-sdk

Public contracts for AgentForge plugins. A plugin declares validated metadata,
initializes through a scoped `PluginContext`, and may provide asynchronous
shutdown behavior.

```ts
import type { Plugin } from "@agentforge/plugin-sdk";

const plugin: Plugin = {
  metadata: { name: "example", version: "1.0.0" },
  async initialize(context) {
    context.logger.info("Example plugin initialized");
  },
};
```

Registration is explicit. The SDK does not provide plugin discovery,
auto-loading, replacement, dependency ordering, or a plugin base class.
