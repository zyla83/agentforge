import { AgentForge } from "@agentforge/core";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";
import {
  LLMFinishReason,
  LLMMessageRole,
  healthyProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
} from "@agentforge/provider-sdk";

const exampleLLMProvider: LLMProvider = {
  metadata: {
    name: "example-llm",
    version: "1.0.0",
    description: "Deterministic LLM provider for the basic example.",
  },

  async checkHealth() {
    return healthyProvider("Example provider is ready.");
  },

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    return {
      model: request.model,
      message: {
        role: LLMMessageRole.Assistant,
        content: "Example response",
      },
      finishReason: LLMFinishReason.Stop,
    };
  },
};

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

  console.log("Stopping AgentForge...");
  await agent.stop();
  console.log(`AgentForge state: ${agent.getState()}`);
}

main().catch((error: unknown) => {
  console.error("The example failed.", error);
  process.exitCode = 1;
});
