import {
  AgentForge,
  ConversationTurnAbortedError,
  createAgentProfile,
  createConversation,
  createConversationTurnController,
} from "@agentforge/core";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  ProviderAbortError,
  ProviderError,
  ProviderHealthStatus,
} from "@agentforge/provider-sdk";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1:8b";
const REQUEST_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  const provider = new OllamaLLMProvider({
    clientOptions: { baseUrl },
    healthCheck: { model },
  });
  const agent = new AgentForge({ instanceName: "ollama-agent" });
  agent.registerLLMProvider(provider, { default: true });

  await agent.start();
  try {
    const health = await provider.checkHealth({
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    console.log(`Ollama health: ${health.status}`);
    if (health.message !== undefined) console.log(health.message);
    if (health.details !== undefined) {
      console.log(`Ollama details: ${JSON.stringify(health.details)}`);
    }

    if (health.status !== ProviderHealthStatus.Healthy) {
      process.exitCode = 1;
      return;
    }

    const profile = createAgentProfile({
      id: "ollama-local",
      systemPrompt: "You are a concise local AI assistant.",
      model,
      provider: provider.metadata.name,
      generation: { temperature: 0.2 },
    });
    const engine = agent.createConversationEngine({ profile });
    const controller = createConversationTurnController();
    const handleTermination = () => {
      controller.abort(new Error("Process termination requested"));
    };
    process.once("SIGINT", handleTermination);
    process.once("SIGTERM", handleTermination);
    try {
      process.stdout.write("Assistant: ");
      for await (const event of engine.streamTurn({
        conversation: createConversation(),
        content:
          "Reply with one short sentence confirming that AgentForge can communicate with Ollama.",
        request: {
          timeoutMs: REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        },
      })) {
        if (event.type === "delta") process.stdout.write(event.delta);
        if (event.type === "completed") {
          const usage = event.response.usage;
          console.log(`\nFinish reason: ${event.response.finishReason}`);
          if (usage !== undefined) {
            console.log(
              `Tokens: ${usage.inputTokens} input, ${usage.outputTokens} output`,
            );
          }
        }
      }
    } finally {
      process.off("SIGINT", handleTermination);
      process.off("SIGTERM", handleTermination);
    }
  } finally {
    await agent.stop();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConversationTurnAbortedError) {
    console.error(`Ollama conversation cancelled during ${error.phase}.`);
  } else if (error instanceof ProviderAbortError) {
    console.error("Ollama provider request was cancelled.");
  } else if (error instanceof ProviderError) {
    console.error(`Ollama example failed: ${error.message}`);
  } else {
    console.error("The Ollama example failed unexpectedly.", error);
  }
  process.exitCode = 1;
});
