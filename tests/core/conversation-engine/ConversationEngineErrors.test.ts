import {
  ConversationEngineError,
  ConversationProviderNotFoundError,
  ConversationProviderStreamingUnsupportedError,
  InvalidConversationTurnError,
} from "@agentforge/core";
import { describe, expect, it } from "vitest";

describe("conversation engine errors", () => {
  it("sets names and preserves native causes", () => {
    const cause = new Error("cause");
    const error = new ConversationEngineError("Failed.", { cause });

    expect(error.name).toBe("ConversationEngineError");
    expect(error.message).toBe("Failed.");
    expect(error.cause).toBe(cause);
  });

  it("copies and freezes invalid-turn details", () => {
    const details = ["content: must be a non-empty string"];
    const error = new InvalidConversationTurnError(details);
    details.push("mutated");

    expect(error.name).toBe("InvalidConversationTurnError");
    expect(error.details).toEqual(["content: must be a non-empty string"]);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error.message).toBe(
      "The conversation turn is invalid: content: must be a non-empty string.",
    );
  });

  it("distinguishes missing default and named providers", () => {
    expect(new ConversationProviderNotFoundError()).toMatchObject({
      name: "ConversationProviderNotFoundError",
      provider: undefined,
      message: "No default LLM provider is registered.",
    });
    expect(new ConversationProviderNotFoundError("local")).toMatchObject({
      provider: "local",
      message: 'LLM provider "local" is not registered.',
    });
  });

  it("describes unsupported streaming providers", () => {
    expect(
      new ConversationProviderStreamingUnsupportedError("mock"),
    ).toMatchObject({
      name: "ConversationProviderStreamingUnsupportedError",
      provider: "mock",
      message: 'LLM provider "mock" does not support streaming.',
    });
  });
});
