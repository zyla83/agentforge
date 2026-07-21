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
      client: {
        getCurrentPlayback,
        searchTracks: async (query: string) =>
          deepFreeze({ query, results: [] }),
        searchPlaylists: async (query: string) =>
          deepFreeze({ query, results: [] }),
        getAvailableDevices: async () => deepFreeze({ devices: [] }),
        startPlayback: async (request: { uri: string }) =>
          deepFreeze({
            status: "accepted" as const,
            itemType: "track" as const,
            uri: request.uri,
          }),
      } as SpotifyClient,
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
        "spotify_search_tracks",
        "spotify_search_playlists",
        "spotify_get_available_devices",
        "spotify_start_playback",
      ]);
      expect(output.read()).toContain(
        "Tools: spotify (spotify_get_current_playback, spotify_search_tracks, spotify_search_playlists, spotify_get_available_devices, spotify_start_playback)",
      );
      expect(errors.read()).toBe("");
    } finally {
      if (agent.getState() === AgentForgeState.Running) await agent.stop();
    }
  });

  it("executes both search tools and returns normalized results to the model", async () => {
    const provider = new SpotifySearchScriptedProvider();
    const searchTracks = vi.fn(async (query: string) =>
      deepFreeze({
        query,
        results: [
          {
            name: "Test Track",
            artists: ["Test Artist"],
            uri: "spotify:track:test",
          },
        ],
      }),
    );
    const searchPlaylists = vi.fn(async (query: string) =>
      deepFreeze({
        query,
        results: [
          {
            name: "Test Playlist",
            owner: "Test Owner",
            uri: "spotify:playlist:test",
          },
        ],
      }),
    );
    const spotify = {
      client: {
        getCurrentPlayback: async () =>
          Object.freeze({ status: "idle" as const }),
        searchTracks,
        searchPlaylists,
        getAvailableDevices: async () => deepFreeze({ devices: [] }),
        startPlayback: async (request: { uri: string }) =>
          deepFreeze({
            status: "accepted" as const,
            itemType: "track" as const,
            uri: request.uri,
          }),
      } as SpotifyClient,
    };
    const agent = new AgentForge();
    agent.registerLLMProvider(provider, { default: true });
    const tools = createChatToolOptions("spotify", spotify);
    registerConfiguredChatTools(agent, tools, spotify);
    await agent.start();
    try {
      const profile = createAgentProfile({
        id: "spotify-search-chat",
        systemPrompt: "Use Spotify catalog search when requested.",
        provider: provider.metadata.name,
        model: "scripted-model",
      });
      const store = createInMemoryConversationStore();
      const initialEntry = await store.save(
        createConversation({ id: "spotify-search-active" }),
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
      input.write("Find a track.\n");
      await output.waitFor("Assistant: Track found.\nYou: ");
      input.write("Find a playlist.\n");
      await output.waitFor("Assistant: Playlist found.\nYou: ");
      input.write("/exit\n");
      await running;

      expect(searchTracks).toHaveBeenCalledTimes(1);
      expect(searchTracks).toHaveBeenCalledWith("Test Track", {
        limit: 1,
        signal: expect.any(AbortSignal),
      });
      expect(searchPlaylists).toHaveBeenCalledTimes(1);
      expect(searchPlaylists).toHaveBeenCalledWith("Test Playlist", {
        signal: expect.any(AbortSignal),
      });
      expect(provider.requests).toHaveLength(4);
      expect(provider.requests[0]?.tools?.map(({ name }) => name)).toEqual([
        "spotify_get_current_playback",
        "spotify_search_tracks",
        "spotify_search_playlists",
        "spotify_get_available_devices",
        "spotify_start_playback",
      ]);
      const trackResult = provider.requests[1]?.messages.find(
        (message) => message.role === LLMMessageRole.Tool,
      );
      expect(trackResult).toMatchObject({
        toolName: "spotify_search_tracks",
        result: {
          status: "success",
          output: {
            query: "Test Track",
            results: [{ uri: "spotify:track:test" }],
          },
        },
      });
      const playlistResult = provider.requests[3]?.messages
        .filter((message) => message.role === LLMMessageRole.Tool)
        .at(-1);
      expect(playlistResult).toMatchObject({
        toolName: "spotify_search_playlists",
        result: {
          status: "success",
          output: {
            query: "Test Playlist",
            results: [{ uri: "spotify:playlist:test" }],
          },
        },
      });
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

class SpotifySearchScriptedProvider implements LLMStreamingProvider {
  readonly metadata = Object.freeze({
    name: "spotify-search-scripted",
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
    if (this.requests.length === 1 || this.requests.length === 3) {
      const track = this.requests.length === 1;
      yield {
        type: "completed",
        response: createLLMGenerationResponse({
          model: request.model,
          message: {
            role: LLMMessageRole.Assistant,
            content: "",
            toolCalls: [
              createToolCall({
                id: track ? "track-call" : "playlist-call",
                name: track
                  ? "spotify_search_tracks"
                  : "spotify_search_playlists",
                arguments: track
                  ? { query: "Test Track", limit: 1 }
                  : { query: "Test Playlist" },
              }),
            ],
          },
          finishReason: LLMFinishReason.ToolCalls,
        }),
      } as const;
      return;
    }
    const content =
      this.requests.length === 2 ? "Track found." : "Playlist found.";
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
