import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agentforge/config": fileURLToPath(
        new URL("./packages/config/src/index.ts", import.meta.url),
      ),
      "@agentforge/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@agentforge/example-tools": fileURLToPath(
        new URL("./packages/example-tools/src/index.ts", import.meta.url),
      ),
      "@agentforge/logger": fileURLToPath(
        new URL("./packages/logger/src/index.ts", import.meta.url),
      ),
      "@agentforge/ollama-client": fileURLToPath(
        new URL("./packages/ollama-client/src/index.ts", import.meta.url),
      ),
      "@agentforge/plugin-sdk": fileURLToPath(
        new URL("./packages/plugin-sdk/src/index.ts", import.meta.url),
      ),
      "@agentforge/provider-mock": fileURLToPath(
        new URL("./packages/provider-mock/src/index.ts", import.meta.url),
      ),
      "@agentforge/provider-ollama": fileURLToPath(
        new URL("./packages/provider-ollama/src/index.ts", import.meta.url),
      ),
      "@agentforge/provider-sdk": fileURLToPath(
        new URL("./packages/provider-sdk/src/index.ts", import.meta.url),
      ),
      "@agentforge/shared": fileURLToPath(
        new URL("./packages/shared/src/index.ts", import.meta.url),
      ),
      "@agentforge/storage-filesystem": fileURLToPath(
        new URL("./packages/storage-filesystem/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
