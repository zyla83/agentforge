import { AgentForge } from "@agentforge/core";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  LLMMessageRole,
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

    const defaultProvider = agent.getDefaultLLMProvider();
    if (defaultProvider === undefined) {
      throw new Error("No default LLM provider is registered.");
    }
    const response = await defaultProvider.generate({
      model,
      messages: [
        {
          role: LLMMessageRole.User,
          content:
            "Reply with one short sentence confirming that AgentForge can communicate with Ollama.",
        },
      ],
      request: { timeoutMs: REQUEST_TIMEOUT_MS },
    });
    console.log(`Assistant: ${response.message.content}`);
  } finally {
    await agent.stop();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ProviderError) {
    console.error(`Ollama example failed: ${error.message}`);
  } else {
    console.error("The Ollama example failed unexpectedly.");
  }
  process.exitCode = 1;
});
