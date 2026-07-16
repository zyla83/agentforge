import { createAgentProfile } from "@agentforge/core";
import { describe, expect, it } from "vitest";

describe("createAgentProfile", () => {
  it("creates a frozen minimal profile and preserves the prompt exactly", () => {
    const systemPrompt = "  First line.\n\n**Second line.**  ";
    const profile = createAgentProfile({
      id: " concise ",
      systemPrompt,
    });

    expect(profile).toEqual({ id: " concise ", systemPrompt });
    expect(Object.isFrozen(profile)).toBe(true);
    expect("model" in profile).toBe(false);
    expect("provider" in profile).toBe(false);
    expect("generation" in profile).toBe(false);
  });

  it("supports optional model, provider, and generation defaults", () => {
    const profile = createAgentProfile({
      id: "assistant",
      systemPrompt: "Assist the user.",
      model: " model ",
      provider: " provider ",
      generation: {
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 128,
        stop: ["END"],
      },
    });

    expect(profile).toEqual({
      id: "assistant",
      systemPrompt: "Assist the user.",
      model: " model ",
      provider: " provider ",
      generation: {
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 128,
        stop: ["END"],
      },
    });
    expect(Object.isFrozen(profile.generation)).toBe(true);
    expect(Object.isFrozen(profile.generation?.stop)).toBe(true);
  });

  it("snapshots generation values without freezing caller-owned input", () => {
    const stop = ["FIRST"];
    const generation = { temperature: 0.2, stop };
    const input = {
      id: "snapshot",
      systemPrompt: "Keep the snapshot.",
      generation,
    };
    const profile = createAgentProfile(input);

    generation.temperature = 0.9;
    stop[0] = "CHANGED";
    stop.push("SECOND");

    expect(profile.generation).toEqual({
      temperature: 0.2,
      stop: ["FIRST"],
    });
    expect(profile.generation).not.toBe(generation);
    expect(profile.generation?.stop).not.toBe(stop);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(generation)).toBe(false);
    expect(Object.isFrozen(stop)).toBe(false);
  });
});
