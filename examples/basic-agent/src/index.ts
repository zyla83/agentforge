import { AgentForge } from "@agentforge/core";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";
import { MockLLMProvider } from "@agentforge/provider-mock";
import { LLMMessageRole } from "@agentforge/provider-sdk";

const exampleLLMProvider = new MockLLMProvider({
  name: "example-llm",
  version: "1.0.0",
  description: "Deterministic LLM provider for the basic example.",
  responseContent: "Hello from the AgentForge mock provider.",
});

function createExamplePlugin(
  name: string,
  version: string,
  inspectDefaultProvider = false,
): Plugin {
  let logger: PluginContext["logger"] | undefined;

  return {
    metadata: {
      name,
      version,
      description: `Example ${name} plugin`,
    },

    async initialize(context) {
      logger = context.logger;
      context.logger.info("Example plugin initialized");

      if (inspectDefaultProvider) {
        const defaultProvider = context.llmProviders.getDefault();
        context.logger.info("Default LLM provider inspected", {
          providerName: defaultProvider?.metadata.name,
        });
      }
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

  agent.registerLLMProvider(exampleLLMProvider, { default: true });

  agent
    .register(createExamplePlugin("database", "1.0.0"))
    .register(createExamplePlugin("assistant", "1.0.0", true));

  console.log("Registered LLM providers:");
  for (const metadata of agent.getRegisteredLLMProviders()) {
    console.log(`- ${metadata.name}@${metadata.version}`);
  }
  console.log(
    `Default LLM provider: ${agent.getDefaultLLMProvider()?.metadata.name ?? "none"}`,
  );

  console.log("Registered plugins:");
  for (const metadata of agent.getRegisteredPlugins()) {
    console.log(`- ${metadata.name}@${metadata.version}`);
  }

  console.log("Starting AgentForge...");
  await agent.start();
  console.log(`AgentForge state: ${agent.getState()}`);

  const defaultProvider = agent.getDefaultLLMProvider();
  if (defaultProvider === undefined) {
    throw new Error("No default LLM provider is registered.");
  }

  const userMessage = "Hello, AgentForge!";
  const response = await defaultProvider.generate({
    model: "example-model",
    messages: [{ role: LLMMessageRole.User, content: userMessage }],
  });

  console.log(`User: ${userMessage}`);
  console.log(`Assistant: ${response.message.content}`);
  console.log(`Recorded requests: ${exampleLLMProvider.getRequests().length}`);

  console.log("Stopping AgentForge...");
  await agent.stop();
  console.log(`AgentForge state: ${agent.getState()}`);
}

main().catch((error: unknown) => {
  console.error("The example failed.", error);
  process.exitCode = 1;
});
