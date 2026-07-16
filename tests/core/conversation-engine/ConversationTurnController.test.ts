import { createConversationTurnController } from "@agentforge/core";
import { describe, expect, it, vi } from "vitest";

describe("ConversationTurnController", () => {
  it("exposes a frozen controller backed by a native signal", () => {
    const controller = createConversationTurnController();

    expect(Object.isFrozen(controller)).toBe(true);
    expect(controller.signal).toBeInstanceOf(AbortSignal);
    expect(controller.aborted).toBe(false);
    expect(controller.reason).toBeUndefined();
  });

  it("aborts once and preserves the first reason", () => {
    const controller = createConversationTurnController();
    const listener = vi.fn();
    const firstReason = { message: "first" };
    controller.signal.addEventListener("abort", listener);

    controller.abort(firstReason);
    controller.abort(new Error("second"));

    expect(controller.aborted).toBe(true);
    expect(controller.reason).toBe(firstReason);
    expect(controller.signal.reason).toBe(firstReason);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("creates independent controllers", () => {
    const first = createConversationTurnController();
    const second = createConversationTurnController();

    first.abort("first");

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    expect(first.signal).not.toBe(second.signal);
  });
});
