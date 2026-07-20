import { AgentForge, createAgentProfile } from "@agentforge/core";
import type { SpotifyClient } from "@agentforge/spotify-client";
import { describe, expect, it } from "vitest";
import {
  createChatConversationEngine,
  createChatToolOptions,
  registerConfiguredChatTools,
} from "../../../examples/chat-cli/src/chatTools.js";

describe("chat tool startup configuration", () => {
  const spotify = {
    client: {
      getCurrentPlayback: async () =>
        Object.freeze({ status: "idle" as const }),
    } as SpotifyClient,
  };
  it("keeps tools absent and disabled in off mode", () => {
    const agent = new AgentForge();
    const tools = createChatToolOptions("off");
    registerConfiguredChatTools(agent, tools);

    expect(tools).toEqual({ mode: "off", definitions: [] });
    expect(Object.isFrozen(tools)).toBe(true);
    expect(Object.isFrozen(tools.definitions)).toBe(true);
    expect(agent.getRegisteredTools()).toEqual([]);
  });

  it("registers all example tools once in canonical order", () => {
    const agent = new AgentForge();
    const tools = createChatToolOptions("example");
    registerConfiguredChatTools(agent, tools);

    expect(tools.definitions.map(({ name }) => name)).toEqual([
      "calculator",
      "format_text",
      "lookup_inventory",
    ]);
    expect(
      agent.getRegisteredTools().map(({ definition }) => definition.name),
    ).toEqual(["calculator", "format_text", "lookup_inventory"]);
    expect(() => registerConfiguredChatTools(agent, tools)).toThrow();
  });

  it("registers only the Spotify current playback tool in Spotify mode", () => {
    const agent = new AgentForge();
    const tools = createChatToolOptions("spotify", spotify);
    registerConfiguredChatTools(agent, tools, spotify);
    expect(tools.definitions.map(({ name }) => name)).toEqual([
      "spotify_get_current_playback",
    ]);
    expect(
      agent.getRegisteredToolDefinitions().map(({ name }) => name),
    ).toEqual(["spotify_get_current_playback"]);
  });

  it("requires injected Spotify dependencies", () => {
    expect(() => createChatToolOptions("spotify")).toThrow(
      "Spotify tool mode requires Spotify dependencies.",
    );
  });

  it("creates an engine for either explicit mode without changing the profile", () => {
    const profile = createAgentProfile({
      id: "chat",
      systemPrompt: "Assist.",
      model: "model",
    });
    const agent = new AgentForge();
    expect(
      createChatConversationEngine(
        agent,
        profile,
        createChatToolOptions("off"),
      ),
    ).toBeDefined();
    registerConfiguredChatTools(agent, createChatToolOptions("example"));
    expect(
      createChatConversationEngine(
        agent,
        profile,
        createChatToolOptions("example"),
      ),
    ).toBeDefined();
    expect(profile.model).toBe("model");
  });
});
