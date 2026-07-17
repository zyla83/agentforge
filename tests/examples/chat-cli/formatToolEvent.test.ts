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
  sanitizeTerminalText,
  truncateTerminalPreview,
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
    expect(preview.endsWith("…")).toBe(true);
    expect(formatJsonPreview("long", 1)).toBe("…");
    expect(formatJsonPreview("long", 0)).toBe("");
  });

  it("sanitizes control characters and terminal escape sequences", () => {
    expect(sanitizeTerminalText("one\n\r\t\0\u007ftwo")).toBe("one two");
    expect(sanitizeTerminalText("safe\u001b[2J\u001b[31mred\u001b[0m")).toBe(
      "safered",
    );
    expect(
      sanitizeTerminalText("before\u001b]0;malicious title\u0007after"),
    ).toBe("beforeafter");
    expect(sanitizeTerminalText("Zażółć  😀")).toBe("Zażółć  😀");
    expect(
      formatToolCallStarted({
        id: "call-1",
        name: "\n\t",
        arguments: {},
      } as never),
    ).toBe("Tool: unknown {}");
  });

  it("truncates by Unicode code point with deterministic edge limits", () => {
    expect(truncateTerminalPreview("abcd", 5)).toBe("abcd");
    expect(truncateTerminalPreview("abcd", 4)).toBe("abcd");
    expect(truncateTerminalPreview("abcd", 3)).toBe("ab…");
    expect(truncateTerminalPreview("😀😀😀", 2)).toBe("😀…");
    expect(truncateTerminalPreview("abcd", 0)).toBe("");
    expect(truncateTerminalPreview("abcd", 1)).toBe("…");
    expect(truncateTerminalPreview("short", -1)).toBe("short");
    expect(truncateTerminalPreview("short", Number.NaN)).toBe("short");
    expect(truncateTerminalPreview("short", Number.POSITIVE_INFINITY)).toBe(
      "short",
    );
  });

  it("renders untrusted identifiers and errors as bounded single lines", () => {
    const maliciousCall = {
      id: "call-1",
      name: "bad\nname\u001b[2J",
      arguments: { value: "line\nbreak" },
    } as never;
    const maliciousResult = {
      status: "error",
      toolCallId: "call-1",
      toolName: "bad\rname",
      error: {
        code: "bad\tcode",
        message: `failure\n\u001b]0;title\u0007${"x".repeat(400)}`,
      },
    } as never;

    const started = formatToolCallStarted(maliciousCall);
    const completed = formatToolCallCompleted(maliciousResult);
    expect(started).toBe('Tool: bad name {"value":"line\\nbreak"}');
    expect(
      ["\r", "\n", "\u001b", "\u0007"].some((value) =>
        completed.includes(value),
      ),
    ).toBe(false);
    expect(completed).toContain("Tool result: bad name failed (bad code):");
    expect(Array.from(completed).length).toBeLessThanOrEqual(452);
    expect(completed.endsWith("…")).toBe(true);
  });

  it("returns a safe fallback when runtime serialization fails", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatJsonPreview(circular as never)).toBe("");
  });
});
