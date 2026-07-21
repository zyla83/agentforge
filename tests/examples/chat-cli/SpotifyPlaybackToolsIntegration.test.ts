import {
  AgentForge,
  createAgentProfile,
  createConversation,
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
  LLMProvider,
  LLMProviderCapabilities,
} from "@agentforge/provider-sdk";
import type { SpotifyClient } from "@agentforge/spotify-client";
import { describe, expect, it, vi } from "vitest";
import {
  createChatConversationEngine,
  createChatToolOptions,
  registerConfiguredChatTools,
} from "../../../examples/chat-cli/src/chatTools.js";

describe("chat CLI Spotify playback-tool integration", () => {
  it("lists devices and starts one track in separate deterministic rounds", async () => {
    const provider = new QueueProvider([
      toolResponse("devices", "spotify_get_available_devices", {}),
      toolResponse("start", "spotify_start_playback", {
        uri: "spotify:track:Track123",
        deviceId: "desktop-id",
      }),
      finalResponse("Spotify accepted the playback request."),
    ]);
    const devices = deepFreeze({
      devices: [
        {
          id: "desktop-id",
          name: "Desktop",
          type: "Computer",
          isActive: true,
          isRestricted: false,
          supportsVolume: true,
          volumePercent: 50,
        },
      ],
    });
    const accepted = deepFreeze({
      status: "accepted" as const,
      itemType: "track" as const,
      uri: "spotify:track:Track123",
      deviceId: "desktop-id",
    });
    const getAvailableDevices = vi.fn(async () => devices);
    const startPlayback = vi.fn(async () => accepted);
    const spotify = spotifyDependencies({
      getAvailableDevices,
      startPlayback,
    });
    const agent = new AgentForge().registerLLMProvider(provider, {
      default: true,
    });
    const tools = createChatToolOptions("spotify", spotify);
    registerConfiguredChatTools(agent, tools, spotify);

    const result = await createChatConversationEngine(
      agent,
      profile(provider.metadata.name),
      tools,
    ).runTurn({
      conversation: createConversation(),
      content: "Play the selected track on my desktop.",
    });

    expect(provider.requests[0]?.tools?.map(({ name }) => name)).toEqual([
      "spotify_get_current_playback",
      "spotify_search_tracks",
      "spotify_search_playlists",
      "spotify_get_available_devices",
      "spotify_start_playback",
    ]);
    expect(getAvailableDevices).toHaveBeenCalledTimes(1);
    expect(getAvailableDevices).toHaveBeenCalledWith({});
    expect(startPlayback).toHaveBeenCalledTimes(1);
    expect(startPlayback).toHaveBeenCalledWith(
      {
        uri: "spotify:track:Track123",
        deviceId: "desktop-id",
      },
      {},
    );
    expect(result.toolExecutions.map(({ call }) => call.name)).toEqual([
      "spotify_get_available_devices",
      "spotify_start_playback",
    ]);
    expect(result.toolExecutions[1]?.result).toMatchObject({
      status: "success",
      output: accepted,
    });
    expect(result.assistantMessage.content).toBe(
      "Spotify accepted the playback request.",
    );
    expect(result.assistantMessage.content).not.toMatch(/audible|confirmed/iu);
  });

  it("starts one playlist without implicit device lookup or verification", async () => {
    const provider = new QueueProvider([
      toolResponse("start", "spotify_start_playback", {
        uri: "spotify:playlist:List123",
      }),
      finalResponse("Spotify accepted the playlist request."),
    ]);
    const accepted = deepFreeze({
      status: "accepted" as const,
      itemType: "playlist" as const,
      uri: "spotify:playlist:List123",
    });
    const getAvailableDevices = vi.fn();
    const getCurrentPlayback = vi.fn();
    const searchTracks = vi.fn();
    const searchPlaylists = vi.fn();
    const startPlayback = vi.fn(async () => accepted);
    const spotify = spotifyDependencies({
      getAvailableDevices,
      getCurrentPlayback,
      searchTracks,
      searchPlaylists,
      startPlayback,
    });
    const agent = new AgentForge().registerLLMProvider(provider, {
      default: true,
    });
    const tools = createChatToolOptions("spotify", spotify);
    registerConfiguredChatTools(agent, tools, spotify);

    const result = await createChatConversationEngine(
      agent,
      profile(provider.metadata.name),
      tools,
    ).runTurn({
      conversation: createConversation(),
      content: "Start the selected playlist.",
    });

    expect(startPlayback).toHaveBeenCalledTimes(1);
    expect(startPlayback).toHaveBeenCalledWith(
      { uri: "spotify:playlist:List123" },
      {},
    );
    expect(getAvailableDevices).not.toHaveBeenCalled();
    expect(getCurrentPlayback).not.toHaveBeenCalled();
    expect(searchTracks).not.toHaveBeenCalled();
    expect(searchPlaylists).not.toHaveBeenCalled();
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions[0]?.result).toMatchObject({
      status: "success",
      output: accepted,
    });
  });
});

class QueueProvider implements LLMProvider {
  readonly metadata = Object.freeze({
    name: "spotify-playback",
    version: "1.0.0",
  });
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: false,
    tools: true,
  });
  readonly requests: LLMGenerationRequest[] = [];

  constructor(private readonly responses: LLMGenerationResponse[]) {}

  async checkHealth() {
    return healthyProvider();
  }

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("No queued response.");
    return response;
  }
}

function toolResponse(
  id: string,
  name: string,
  argumentsValue: Readonly<Record<string, string>>,
): LLMGenerationResponse {
  return createLLMGenerationResponse({
    model: "model",
    message: {
      role: LLMMessageRole.Assistant,
      content: "",
      toolCalls: [createToolCall({ id, name, arguments: argumentsValue })],
    },
    finishReason: LLMFinishReason.ToolCalls,
  });
}

function finalResponse(content: string): LLMGenerationResponse {
  return createLLMGenerationResponse({
    model: "model",
    message: { role: LLMMessageRole.Assistant, content },
    finishReason: LLMFinishReason.Stop,
  });
}

function profile(provider: string) {
  return createAgentProfile({
    id: "spotify-playback-chat",
    systemPrompt: "Use Spotify tools only when requested.",
    provider,
    model: "model",
  });
}

function spotifyDependencies(overrides: Readonly<Partial<SpotifyClient>>): {
  readonly client: SpotifyClient;
} {
  return {
    client: {
      getCurrentPlayback: async () =>
        Object.freeze({ status: "idle" as const }),
      searchTracks: async (query: string) => deepFreeze({ query, results: [] }),
      searchPlaylists: async (query: string) =>
        deepFreeze({ query, results: [] }),
      getAvailableDevices: async () => deepFreeze({ devices: [] }),
      startPlayback: async (request: { uri: string }) =>
        deepFreeze({
          status: "accepted" as const,
          itemType: "track" as const,
          uri: request.uri,
        }),
      ...overrides,
    } as SpotifyClient,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
