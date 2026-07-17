import { describe, expect, it } from "vitest";
import { createChatProfile } from "../../../examples/chat-cli/src/createChatProfile.js";
import type { ChatEnvironment } from "../../../examples/chat-cli/src/environment.js";

describe("createChatProfile", () => {
  it("creates the expected immutable interactive profile", () => {
    const environment: ChatEnvironment = {
      baseUrl: "http://localhost:11434",
      model: "model",
      systemPrompt: "System instruction.",
      timeoutMs: 120_000,
      dataDirectory: "C:\\chat-data",
      toolMode: "off",
    };
    const before = { ...environment };

    const profile = createChatProfile(environment, "ollama");

    expect(profile).toEqual({
      id: "interactive-chat",
      systemPrompt: "System instruction.",
      model: "model",
      provider: "ollama",
      generation: { temperature: 0.2 },
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.generation)).toBe(true);
    expect(environment).toEqual(before);
  });
});
