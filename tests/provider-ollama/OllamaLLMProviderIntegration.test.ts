import { AgentForge } from "@agentforge/core";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { ProviderHealthStatus } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

describe("OllamaLLMProvider AgentForge integration", () => {
  it("registers and generates through the default provider", async () => {
    const client = new FakeOllamaClient();
    const provider = new OllamaLLMProvider({ client: asOllamaClient(client) });
    const agent = new AgentForge();

    agent.registerLLMProvider(provider, { default: true });

    expect(agent.hasLLMProvider("ollama")).toBe(true);
    expect(agent.getDefaultLLMProvider()).toBe(provider);
    const response = await agent.getDefaultLLMProvider()?.generate({
      model: "local-model",
      messages: [{ role: LLMMessageRole.User, content: "Hello" }],
    });
    expect(response?.message.content).toBe("Ollama response");
    expect(client.chatCalls).toHaveLength(1);
  });

  it("checks configured model readiness through the registered provider", async () => {
    const client = new FakeOllamaClient();
    client.modelResult = [{ name: "llama3.1:8b", model: "llama3.1:8b" }];
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
      healthCheck: { model: "llama3.1:8b" },
    });
    const agent = new AgentForge();

    agent.registerLLMProvider(provider, { default: true });

    expect(client.versionCalls).toEqual([]);
    expect(client.modelCalls).toEqual([]);
    const registered = agent.getLLMProvider("ollama");
    await expect(registered?.checkHealth()).resolves.toMatchObject({
      status: ProviderHealthStatus.Healthy,
      details: { modelAvailable: true },
    });

    client.modelResult = [];
    await expect(registered?.checkHealth()).resolves.toMatchObject({
      status: ProviderHealthStatus.Degraded,
      details: { modelAvailable: false },
    });
  });
});
