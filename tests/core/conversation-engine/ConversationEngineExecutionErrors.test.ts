import {
  ConversationEngineError,
  ConversationProviderNotFoundError,
  ConversationProviderStreamingUnsupportedError,
  ConversationTurnAbortedError,
  ConversationTurnExecutionError,
  ConversationTurnExecutionPhase,
  InvalidAgentProfileError,
  InvalidConversationTurnError,
} from "@agentforge/core";
import { describe, expect, it } from "vitest";

describe("Conversation engine execution errors", () => {
  it("preserves abort phase, reason, and native cause", () => {
    const reason = { operation: "shutdown" };
    const error = new ConversationTurnAbortedError(
      ConversationTurnExecutionPhase.ProviderExecution,
      { reason },
    );

    expect(error).toMatchObject({
      name: "ConversationTurnAbortedError",
      message: "Conversation turn was aborted during provider-execution.",
      phase: ConversationTurnExecutionPhase.ProviderExecution,
      reason,
      cause: reason,
    });
    expect(error).toBeInstanceOf(ConversationEngineError);
  });

  it("preserves execution phase and cause", () => {
    const cause = new Error("invariant cause");
    const error = new ConversationTurnExecutionError(
      ConversationTurnExecutionPhase.AssistantAppend,
      "Conversation invariant failed.",
      { cause },
    );

    expect(error).toMatchObject({
      name: "ConversationTurnExecutionError",
      message: "Conversation invariant failed.",
      phase: ConversationTurnExecutionPhase.AssistantAppend,
      cause,
    });
    expect(error).toBeInstanceOf(ConversationEngineError);
  });

  it("keeps existing specific errors in the engine hierarchy", () => {
    const errors = [
      new InvalidConversationTurnError(["turn: invalid"]),
      new ConversationProviderNotFoundError("missing"),
      new ConversationProviderStreamingUnsupportedError("complete-only"),
    ];

    expect(
      errors.every((error) => error instanceof ConversationEngineError),
    ).toBe(true);
    expect(
      new InvalidAgentProfileError(["profile: invalid"]),
    ).not.toBeInstanceOf(ConversationEngineError);
  });
});
