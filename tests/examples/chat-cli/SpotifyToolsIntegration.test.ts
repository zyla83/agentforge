import { PassThrough } from "node:stream";
import {
  AgentForge,
  AgentForgeState,
  createAgentProfile,
  createConversation,
  createInMemoryConversationStore,
  serializeConversation,
} from "@agentforge/core";
import {
  LLMFinishReason,
  LLMMessageRole,
  createLLMGenerationResponse,
  createToolCall,
  healthyProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProviderCapabilities,
  LLMStreamingProvider,
} from "@agentforge/provider-sdk";
import type { SpotifyClient } from "@agentforge/spotify-client";
import { describe, expect, it, vi } from "vitest";
import { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";
import {
  createChatConversationEngine,
  createChatToolOptions,
  registerConfiguredChatTools,
} from "../../../examples/chat-cli/src/chatTools.js";
import { captureStream } from "./chatTestUtils.js";

describe("chat CLI Spotify tool integration", () => {
  it("executes one read-only playback call, persists V2 normalized history, and completes the next provider round", async () => {
    const provider = new SpotifyScriptedProvider();
    const getCurrentPlayback = vi.fn(async () =>
      deepFreeze({
        status: "playing" as const,
        progressMs: 42_000,
        device: { name: "Desktop", type: "Computer", isActive: true },
        item: {
          type: "track" as const,
          name: "Test Track",
          artists: ["Test Artist"],
        },
      }),
    );
    const spotify = {
      client: { getCurrentPlayback } as SpotifyClient,
    };
    const agent = new AgentForge();
    agent.registerLLMProvider(provider, { default: true });
    const tools = createChatToolOptions("spotify", spotify);
    registerConfiguredChatTools(agent, tools, spotify);
    await agent.start();
    try {
      const profile = createAgentProfile({
        id: "spotify-chat",
        systemPrompt: "Use Spotify playback inspection when requested.",
        provider: provider.metadata.name,
        model: "scripted-model",
      });
      const store = createInMemoryConversationStore();
      const initialEntry = await store.save(
        createConversation({ id: "spotify-active" }),
      );
      const input = new PassThrough();
      const output = captureStream();
      const errors = captureStream();
      const application = new ChatApplication({
        agent,
        engine: createChatConversationEngine(agent, profile, tools),
        profile,
        store,
        initialEntry,
        dataDirectory: "C:\\chat-data",
        timeoutMs: 1_000,
        input,
        output: output.stream,
        errorOutput: errors.stream,
        tools,
      });
      const running = application.run();
      await output.waitFor("You: ");
      input.write("What is playing?\n");
      await output.waitFor("Assistant: Test Track is playing.\nYou: ");
      input.write("/exit\n");
      await running;

      const persisted = await store.require("spotify-active");
      const document = JSON.parse(
        serializeConversation(persisted.conversation),
      );
      expect(document.version).toBe(2);
      expect(
        document.conversation.messages.map(
          (message: { role: string }) => message.role,
        ),
      ).toEqual(["user", "assistant", "tool", "assistant"]);
      expect(document.conversation.messages[2].result.output).toEqual({
        status: "playing",
        progressMs: 42_000,
        device: { name: "Desktop", type: "Computer", isActive: true },
        item: { type: "track", name: "Test Track", artists: ["Test Artist"] },
      });
      expect(getCurrentPlayback).toHaveBeenCalledTimes(1);
      expect(provider.requests).toHaveLength(2);
      expect(provider.requests[0]?.tools?.map(({ name }) => name)).toEqual([
        "spotify_get_current_playback",
      ]);
      expect(output.read()).toContain(
        "Tools: spotify (spotify_get_current_playback)",
      );
      expect(errors.read()).toBe("");
    } finally {
      if (agent.getState() === AgentForgeState.Running) await agent.stop();
    }
  });
});

class SpotifyScriptedProvider implements LLMStreamingProvider {
  readonly metadata = Object.freeze({
    name: "spotify-scripted",
    version: "1.0.0",
  });
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: true,
    tools: true,
  });
  readonly requests: LLMGenerationRequest[] = [];

  async checkHealth() {
    return healthyProvider();
  }
  async generate(): Promise<LLMGenerationResponse> {
    throw new Error("Streaming is required.");
  }

  async *stream(request: LLMGenerationRequest) {
    this.requests.push(request);
    if (this.requests.length === 1) {
      yield {
        type: "completed",
        response: createLLMGenerationResponse({
          model: request.model,
          message: {
            role: LLMMessageRole.Assistant,
            content: "",
            toolCalls: [
              createToolCall({
                id: "spotify-call",
                name: "spotify_get_current_playback",
                arguments: {},
              }),
            ],
          },
          finishReason: LLMFinishReason.ToolCalls,
        }),
      } as const;
      return;
    }
    const content = "Test Track is playing.";
    yield { type: "delta", model: request.model, delta: content } as const;
    yield {
      type: "completed",
      response: createLLMGenerationResponse({
        model: request.model,
        message: { role: LLMMessageRole.Assistant, content },
        finishReason: LLMFinishReason.Stop,
      }),
    } as const;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
