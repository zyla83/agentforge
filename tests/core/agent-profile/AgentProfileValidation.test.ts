import { InvalidAgentProfileError, createAgentProfile } from "@agentforge/core";
import { describe, expect, it } from "vitest";

describe("AgentProfile validation", () => {
  it.each([undefined, null, [], "profile", 42, true])(
    "rejects malformed runtime profile %#",
    (profile) => {
      expect(() => createAgentProfile(profile as never)).toThrowError(
        new InvalidAgentProfileError(["profile: must be an object"]),
      );
    },
  );

  it("reports field errors in deterministic order", () => {
    const error = captureError({
      id: " ",
      systemPrompt: 42,
      model: "",
      provider: [],
      generation: {
        temperature: 3,
        topP: 0,
        maxTokens: 0,
        stop: ["", 42],
      },
    });

    expect(error.details).toEqual([
      "id: must be a non-empty string",
      "systemPrompt: must be a non-empty string",
      "model: must be a non-empty string when provided",
      "provider: must be a non-empty string when provided",
      "generation.temperature: must be between 0 and 2",
      "generation.topP: must be greater than 0 and at most 1",
      "generation.maxTokens: must be a positive finite integer",
      "generation.stop[0]: must be a non-empty string",
      "generation.stop[1]: must be a non-empty string",
    ]);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it.each([
    [{ systemPrompt: "Prompt" }, "id: must be a non-empty string"],
    [{ id: "profile" }, "systemPrompt: must be a non-empty string"],
    [
      { id: "profile", systemPrompt: "Prompt", generation: [] },
      "generation: must be an object",
    ],
    [
      { id: "profile", systemPrompt: "Prompt", generation: { stop: [] } },
      "generation.stop: must contain at least one stop sequence",
    ],
  ])("rejects invalid profile fields %#", (profile, detail) => {
    expect(captureError(profile).details).toContain(detail);
  });
});

function captureError(profile: unknown): InvalidAgentProfileError {
  try {
    createAgentProfile(profile as never);
    throw new Error("Expected profile creation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidAgentProfileError);
    return error as InvalidAgentProfileError;
  }
}
