import { AgentForge } from "@agentforge/core";
import { MockLLMProvider } from "@agentforge/provider-mock";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  LLMMessageRole,
  isLLMStreamingProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMStreamEvent,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const request: LLMGenerationRequest = {
  model: "example-model",
  messages: [{ role: LLMMessageRole.User, content: "Hello" }],
};

async function collect(
  iterable: AsyncIterable<LLMStreamEvent>,
): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("LLM streaming providers in the AgentForge registry", () => {
  it("preserves the mock provider streaming capability", async () => {
    const provider = new MockLLMProvider({
      responseContent: "mock stream",
      streamDeltas: ["mock ", "stream"],
    });
    const agent = new AgentForge().registerLLMProvider(provider, {
      default: true,
    });
    const registered = agent.getDefaultLLMProvider();

    expect(registered).toBe(provider);
    expect(registered !== undefined && isLLMStreamingProvider(registered)).toBe(
      true,
    );
    if (registered === undefined || !isLLMStreamingProvider(registered)) {
      throw new Error("Expected a streaming provider.");
    }
    await expect(collect(registered.stream(request))).resolves.toMatchObject([
      { type: "delta", delta: "mock " },
      { type: "delta", delta: "stream" },
      { type: "completed" },
    ]);
  });

  it("preserves the Ollama provider streaming capability", async () => {
    const client = {
      async getVersion() {
        return { version: "1.0.0" };
      },
      async listModels() {
        return [];
      },
      async chat() {
        return {
          model: "example-model",
          message: { role: "assistant" as const, content: "ollama stream" },
          done: true,
        };
      },
      async *chatStream() {
        yield {
          model: "example-model",
          message: { role: "assistant" as const, content: "ollama " },
          done: false,
        };
        yield {
          model: "example-model",
          message: { role: "assistant" as const, content: "stream" },
          done: false,
        };
        yield { model: "example-model", done: true, doneReason: "stop" };
      },
    };
    const provider = new OllamaLLMProvider({ client: client as never });
    const registered = new AgentForge()
      .registerLLMProvider(provider, { default: true })
      .getDefaultLLMProvider();

    if (registered === undefined || !isLLMStreamingProvider(registered)) {
      throw new Error("Expected a streaming provider.");
    }
    await expect(collect(registered.stream(request))).resolves.toMatchObject([
      { type: "delta", delta: "ollama " },
      { type: "delta", delta: "stream" },
      {
        type: "completed",
        response: { message: { content: "ollama stream" } },
      },
    ]);
  });
});
