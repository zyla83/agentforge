import {
  AgentForge,
  AgentForgeState,
  ConversationEngine,
  createConversation,
} from "@agentforge/core";
import { MockLLMProvider } from "@agentforge/provider-mock";
import { describe, expect, it } from "vitest";

const conversation = createConversation({
  id: "conversation",
  createdAt: "2020-01-01T00:00:00.000Z",
});

describe("AgentForge conversation engine integration", () => {
  it("creates separate engines without changing lifecycle state", () => {
    const agent = new AgentForge();

    const first = agent.createConversationEngine();
    const second = agent.createConversationEngine();

    expect(first).toBeInstanceOf(ConversationEngine);
    expect(second).toBeInstanceOf(ConversationEngine);
    expect(first).not.toBe(second);
    expect(agent.getState()).toBe(AgentForgeState.Created);
    expect("registerLLMProvider" in first).toBe(false);
  });

  it("reflects default providers registered after engine creation", async () => {
    const agent = new AgentForge();
    const engine = agent.createConversationEngine();
    const provider = new MockLLMProvider({
      name: "late-default",
      responseContent: "Default response",
    });
    agent.registerLLMProvider(provider, { default: true });

    const result = await engine.runTurn({
      conversation,
      content: "Hello",
      model: "model",
    });

    expect(result.provider).toBe("late-default");
    expect(agent.getDefaultLLMProvider()).toBe(provider);
    expect(agent.hasLLMProvider("late-default")).toBe(true);
  });

  it("resolves explicitly named registered providers", async () => {
    const first = new MockLLMProvider({
      name: "first",
      responseContent: "First",
    });
    const second = new MockLLMProvider({
      name: "second",
      responseContent: "Second",
    });
    const agent = new AgentForge()
      .registerLLMProvider(first, { default: true })
      .registerLLMProvider(second);

    const result = await agent.createConversationEngine().runTurn({
      conversation,
      content: "Hello",
      model: "model",
      provider: "second",
    });

    expect(result.provider).toBe("second");
    expect(result.assistantMessage.content).toBe("Second");
    expect(first.getRequests()).toEqual([]);
  });

  it("forwards deterministic conversation factory options", async () => {
    const provider = new MockLLMProvider({ responseContent: "Response" });
    const ids = ["user", "assistant"];
    const agent = new AgentForge().registerLLMProvider(provider, {
      default: true,
    });
    const engine = agent.createConversationEngine({
      conversationFactory: {
        idGenerator: () => ids.shift() ?? "unexpected",
        now: () => new Date("2026-07-16T10:01:00.000Z"),
      },
    });

    const result = await engine.runTurn({
      conversation,
      content: "Hello",
      model: "model",
    });

    expect(result.userMessage.id).toBe("user");
    expect(result.assistantMessage.id).toBe("assistant");
  });
});
