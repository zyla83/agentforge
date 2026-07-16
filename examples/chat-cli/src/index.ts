import process from "node:process";
import {
  AgentForge,
  AgentForgeState,
  createConversation,
} from "@agentforge/core";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import { ProviderHealthStatus } from "@agentforge/provider-sdk";
import type { ProviderHealth } from "@agentforge/provider-sdk";
import { ChatApplication } from "./ChatApplication.js";
import { createChatProfile } from "./createChatProfile.js";
import { loadChatEnvironment } from "./environment.js";
import { formatChatError } from "./formatChatError.js";

async function main(): Promise<void> {
  const environment = loadChatEnvironment();
  const provider = new OllamaLLMProvider({
    clientOptions: { baseUrl: environment.baseUrl },
    healthCheck: { model: environment.model },
  });
  const agent = new AgentForge({ instanceName: "interactive-chat" });
  agent.registerLLMProvider(provider, { default: true });

  try {
    await agent.start();
    const health = await provider.checkHealth({
      timeoutMs: environment.timeoutMs,
    });
    assertHealthyOllama(health, environment.model);

    const profile = createChatProfile(environment, provider.metadata.name);
    const engine = agent.createConversationEngine({ profile });
    const application = new ChatApplication({
      agent,
      engine,
      profile,
      initialConversation: createConversation(),
      timeoutMs: environment.timeoutMs,
      input: process.stdin,
      output: process.stdout,
      errorOutput: process.stderr,
    });
    await application.run();
  } finally {
    if (agent.getState() === AgentForgeState.Running) {
      await agent.stop();
    }
  }
}

function assertHealthyOllama(health: ProviderHealth, model: string): void {
  if (health.status === ProviderHealthStatus.Healthy) return;
  if (health.details?.modelAvailable === false) {
    throw new Error(
      `The configured Ollama model "${model}" is not installed.\nInstall the model with:\n  ollama pull ${model}`,
    );
  }
  throw new Error(health.message ?? "Ollama is not healthy.");
}

main().catch((error: unknown) => {
  console.error(formatChatError(error));
  process.exitCode = 1;
});
