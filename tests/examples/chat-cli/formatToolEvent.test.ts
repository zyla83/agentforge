import {
  createToolCall,
  failedToolResult,
  successfulToolResult,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import {
  formatJsonPreview,
  formatToolCallCompleted,
  formatToolCallStarted,
} from "../../../examples/chat-cli/src/tools/formatToolEvent.js";

describe("chat tool event formatting", () => {
  const call = createToolCall({
    id: "call-1",
    name: "calculator",
    arguments: { operation: "multiply", left: 7, right: 6 },
  });

  it("renders deterministic compact arguments and successful output", () => {
    expect(formatToolCallStarted(call)).toBe(
      'Tool: calculator {"operation":"multiply","left":7,"right":6}',
    );
    expect(
      formatToolCallCompleted(successfulToolResult(call, { result: 42 })),
    ).toBe('Tool result: calculator succeeded {"result":42}');
  });

  it("renders structured failures without causes or stacks", () => {
    const line = formatToolCallCompleted(
      failedToolResult(call, {
        code: "tool_execution_failed",
        message: "Division by zero is not allowed.",
        details: { internal: "not rendered" },
      }),
    );
    expect(line).toBe(
      "Tool result: calculator failed (tool_execution_failed): Division by zero is not allowed.",
    );
    expect(line).not.toContain("internal");
    expect(line).not.toContain("stack");
  });

  it("truncates previews within the configured maximum", () => {
    const preview = formatJsonPreview({ value: "x".repeat(500) }, 30);
    expect(preview).toHaveLength(30);
    expect(preview.endsWith("...")).toBe(true);
    expect(formatJsonPreview("long", 1)).toBe(".");
    expect(formatJsonPreview("long", 0)).toBe("");
  });

  it("returns a safe fallback when runtime serialization fails", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatJsonPreview(circular as never)).toBe("");
  });
});
