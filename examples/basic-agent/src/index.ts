import { AgentForge } from "@agentforge/core";
import type { Plugin } from "@agentforge/plugin-sdk";

function createExamplePlugin(name: string): Plugin {
  return {
    name,

    async initialize(context) {
      console.log(
        `[${name}] initialized in ${context.instanceName} with AgentForge ${context.frameworkVersion}; configuration: ${JSON.stringify(context.configuration)}`,
      );
    },

    async shutdown() {
      console.log(`[${name}] shut down`);
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
