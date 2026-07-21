import type {
  AgentForge,
  AgentProfile,
  ConversationEngine,
} from "@agentforge/core";
import {
  exampleToolDefinitions,
  registerExampleTools,
} from "@agentforge/example-tools";
import type { ToolDefinition } from "@agentforge/provider-sdk";
import type { SpotifyClient } from "@agentforge/spotify-client";
import type { ChatApplicationToolOptions } from "./ChatApplicationOptions.js";
import type { ChatToolMode } from "./environment.js";
import {
  createSpotifyCurrentPlaybackToolHandler,
  createSpotifyPlaylistSearchToolHandler,
  createSpotifyTrackSearchToolHandler,
  spotifyCurrentPlaybackToolDefinition,
  spotifyPlaylistSearchToolDefinition,
  spotifyTrackSearchToolDefinition,
} from "./spotifyTools.js";

export interface ChatSpotifyToolDependencies {
  readonly client: SpotifyClient;
}

export function createChatToolOptions(
  mode: ChatToolMode,
  spotify?: Readonly<ChatSpotifyToolDependencies>,
): Readonly<ChatApplicationToolOptions> {
  if (mode === "spotify" && spotify === undefined) {
    throw new Error("Spotify tool mode requires Spotify dependencies.");
  }
  return Object.freeze({
    mode,
    definitions:
      mode === "example"
        ? exampleToolDefinitions
        : mode === "spotify"
          ? Object.freeze([
              spotifyCurrentPlaybackToolDefinition,
              spotifyTrackSearchToolDefinition,
              spotifyPlaylistSearchToolDefinition,
            ])
          : Object.freeze([] as Readonly<ToolDefinition>[]),
  });
}

export function registerConfiguredChatTools(
  agent: AgentForge,
  tools: Readonly<ChatApplicationToolOptions>,
  spotify?: Readonly<ChatSpotifyToolDependencies>,
): void {
  if (tools.mode === "example") registerExampleTools(agent);
  if (tools.mode === "spotify") {
    if (spotify === undefined) {
      throw new Error("Spotify tool mode requires Spotify dependencies.");
    }
    agent.registerTool(
      spotifyCurrentPlaybackToolDefinition,
      createSpotifyCurrentPlaybackToolHandler(spotify.client),
    );
    agent.registerTool(
      spotifyTrackSearchToolDefinition,
      createSpotifyTrackSearchToolHandler(spotify.client),
    );
    agent.registerTool(
      spotifyPlaylistSearchToolDefinition,
      createSpotifyPlaylistSearchToolHandler(spotify.client),
    );
  }
}

export function createChatConversationEngine(
  agent: AgentForge,
  profile: AgentProfile,
  tools: Readonly<ChatApplicationToolOptions>,
): ConversationEngine {
  return agent.createConversationEngine({
    profile,
    toolExecution: { enabled: tools.mode !== "off" },
  });
}
