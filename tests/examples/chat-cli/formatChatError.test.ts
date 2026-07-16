import {
  ConversationProviderNotFoundError,
  ConversationProviderStreamingUnsupportedError,
  ConversationTurnAbortedError,
  ConversationTurnExecutionPhase,
  InvalidAgentProfileError,
  InvalidConversationTurnError,
} from "@agentforge/core";
import { ProviderAbortError, ProviderError } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { formatChatError } from "../../../examples/chat-cli/src/formatChatError.js";

describe("formatChatError", () => {
  it.each([
    [
      new ConversationTurnAbortedError(
        ConversationTurnExecutionPhase.ProviderExecution,
      ),
      "Conversation cancelled during provider-execution.",
    ],
    [
      new ConversationProviderNotFoundError("ollama"),
      "The configured provider is not registered.",
    ],
    [
      new ConversationProviderStreamingUnsupportedError("ollama"),
      "The configured provider does not support streaming.",
    ],
    [
      new InvalidConversationTurnError(["content: invalid"]),
      "Invalid chat request: content: invalid.",
    ],
    [
      new InvalidAgentProfileError(["model: invalid"]),
      "Invalid chat profile: model: invalid.",
    ],
    [new ProviderAbortError("ollama"), "Provider request was cancelled."],
    [
      new ProviderError("Generation failed.", "ollama"),
      "Provider request failed: Generation failed.",
    ],
    [new Error("failure"), "Unexpected error: failure"],
    ["failure", "Unexpected error: failure"],
    [null, "Unexpected error: null"],
    [{ message: "value" }, "Unexpected error: value"],
  ])("formats %#", (error, expected) => {
    expect(formatChatError(error)).toBe(expected);
  });

  it("never throws for hostile non-error values", () => {
    const value = {
      toString() {
        throw new Error("cannot stringify");
      },
    };

    expect(() => formatChatError(value)).not.toThrow();
    expect(formatChatError(value)).toBe("Unexpected error: unknown failure");
  });
});
