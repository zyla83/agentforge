<p align="center">
  <img src="../../asstets/brand/package-icons/config.svg" alt="AgentForge configuration package icon" width="96" height="96">
</p>

# @agentforge/config

Validated configuration loading for AgentForge applications. The package
normalizes an optional instance name and plugin configuration map into a frozen
runtime snapshot.

```ts
import { loadConfig } from "@agentforge/config";

const config = loadConfig({
  instanceName: "desktop-assistant",
  plugins: {},
});
```

Invalid input throws `InvalidConfigurationError`. Unknown top-level keys are
rejected, plugin values remain application-defined, and loading configuration
does not read files or environment variables automatically.
