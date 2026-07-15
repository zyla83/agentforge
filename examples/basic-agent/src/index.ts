import { AgentForge } from "@agentforge/core";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";

function createExamplePlugin(name: string): Plugin {
  let logger: PluginContext["logger"] | undefined;

  return {
    name,

    async initialize(context) {
      logger = context.logger;
      context.logger.info("Example plugin initialized");
    },

    async shutdown() {
      logger?.info("Example plugin shut down");
    },
  };
}

async function main(): Promise<void> {
  const agent = new AgentForge({
    instanceName: "basic-agent",
    plugins: {
      database: {
        storage: "memory",
      },
      assistant: {
        language: "en",
      },
    },
  });

  agent
    .register(createExamplePlugin("database"))
    .register(createExamplePlugin("assistant"));

  console.log("Starting AgentForge...");
  await agent.start();
  console.log(`AgentForge state: ${agent.getState()}`);

  console.log("Stopping AgentForge...");
  await agent.stop();
  console.log(`AgentForge state: ${agent.getState()}`);
}

main().catch((error: unknown) => {
  console.error("The example failed.", error);
  process.exitCode = 1;
});
