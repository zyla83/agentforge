import {
  AgentForge,
  ConversationTurnAbortedError,
  createAgentProfile,
  createConversation,
  createConversationTurnController,
} from "@agentforge/core";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";
import { MockLLMProvider } from "@agentforge/provider-mock";

const exampleLLMProvider = new MockLLMProvider({
  name: "example-llm",
  version: "1.0.0",
  description: "Deterministic LLM provider for the basic example.",
  responseContent: "Hello from the AgentForge mock provider.",
  streamDeltas: ["Hello from ", "the AgentForge ", "mock provider."],
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

  const profile = createAgentProfile({
    id: "friendly-assistant",
    systemPrompt: "You are a friendly and concise assistant.",
    model: "example-model",
    generation: { temperature: 0.2 },
  });
  const engine = agent.createConversationEngine({ profile });
  const result = await engine.runTurn({
    conversation: createConversation(),
    content: "Hello, AgentForge!",
  });

  console.log(`Profile: ${result.profile ?? "none"}`);
  console.log(`User: ${result.userMessage.content}`);
  console.log(`Assistant: ${result.assistantMessage.content}`);
  console.log(`Conversation messages: ${result.conversation.messages.length}`);
  console.log(`Recorded requests: ${exampleLLMProvider.getRequests().length}`);

  process.stdout.write("Streaming assistant: ");
  for await (const event of engine.streamTurn({
    conversation: result.conversation,
    content: "Stream a greeting, please.",
  })) {
    if (event.type === "delta") process.stdout.write(event.delta);
    if (event.type === "completed") {
      console.log(`\nStreaming finish reason: ${event.response.finishReason}`);
    }
  }
  console.log(`Recorded requests: ${exampleLLMProvider.getRequests().length}`);

  const cancellationController = createConversationTurnController();
  cancellationController.abort(new Error("Example cancellation"));
  try {
    await engine.runTurn({
      conversation: result.conversation,
      content: "This turn will be cancelled.",
      request: { signal: cancellationController.signal },
    });
  } catch (error) {
    if (error instanceof ConversationTurnAbortedError) {
      console.log(`Cancelled during: ${error.phase}`);
    } else {
      throw error;
    }
  }
  console.log(`Recorded requests: ${exampleLLMProvider.getRequests().length}`);

  console.log("Stopping AgentForge...");
  await agent.stop();
  console.log(`AgentForge state: ${agent.getState()}`);
}

main().catch((error: unknown) => {
  console.error("The example failed.", error);
  process.exitCode = 1;
});
