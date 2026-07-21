<p align="center">
  <img src="../../asstets/brand/package-icons/logger.svg" alt="AgentForge logger package icon" width="96" height="96">
</p>

# @agentforge/logger

A small structured logging abstraction used by the AgentForge runtime and
plugins. The public `Logger` contract supports level-specific messages,
structured context, and child loggers without exposing the concrete backend.

```ts
import { createLogger } from "@agentforge/logger";

const logger = createLogger({ level: "info", name: "agentforge-app" });
logger.info("Application started", { component: "example" });
```

The default implementation writes structured JSON through Pino. Logging does
not provide automatic secret redaction; applications remain responsible for
the values they include in log context.
