import { AgentForge } from "@agentforge/core";
import type { Plugin } from "@agentforge/plugin-sdk";

function createExamplePlugin(name: string): Plugin {
  return {
    name,

    async initialize(context) {
      console.log(
        `[${name}] initialized with AgentForge ${context.frameworkVersion}`,
      );
    },

    async shutdown() {
      console.log(`[${name}] shut down`);
    },
  };
}

async function main(): Promise<void> {
  const agent = new AgentForge();

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
