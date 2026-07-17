import {
  InvalidToolResultError,
  ToolContractError,
  createToolCall,
  createToolExecutionContext,
  createToolResult,
  failedToolResult,
  successfulToolResult,
  validateToolResult,
} from "@agentforge/provider-sdk";
import type { ToolResult } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function capture(value: unknown): InvalidToolResultError {
  try {
    validateToolResult(value as ToolResult);
  } catch (error) {
    if (error instanceof InvalidToolResultError) return error;
    throw error;
  }
  throw new Error("Expected tool result validation to fail.");
}

describe("successful tool results", () => {
  it.each([null, "text", 42, true, [1, "two"], { nested: { value: 1 } }])(
    "accepts JSON output %#",
    (output) => {
      const result = createToolResult({
        toolCallId: " call-1 ",
        toolName: "Weather2",
        status: "success",
        output,
      });
      expect(result.toolCallId).toBe(" call-1 ");
      expect(result.toolName).toBe("Weather2");
      expect(result.status).toBe("success");
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it("copies and freezes nested output without freezing caller data", () => {
    const output = { values: [1, { ok: true }] };
    const result = successfulToolResult(
      { id: "call-1", name: "calculator" },
      output,
    );
    (output.values as unknown[]).push(2);

    expect(result.output).toEqual({ values: [1, { ok: true }] });
    expect(Object.isFrozen(result.output)).toBe(true);
    expect(
      Object.isFrozen((result.output as { values: unknown[] }).values),
    ).toBe(true);
    expect(Object.isFrozen(output)).toBe(false);
  });

  it("accepts a complete tool call in the convenience factory", () => {
    const call = createToolCall({
      id: "call-1",
      name: "calculator",
      arguments: { expression: "1+1" },
    });
    expect(successfulToolResult(call, 2)).toEqual({
      toolCallId: "call-1",
      toolName: "calculator",
      status: "success",
      output: 2,
    });
  });

  it.each([undefined, Number.NaN, new Error("no"), () => undefined])(
    "rejects invalid output %#",
    (output) => {
      expect(
        capture({
          toolCallId: "call-1",
          toolName: "calculator",
          status: "success",
          output,
        }).details.join("; "),
      ).toContain("output");
    },
  );

  it("rejects wrong status and unknown properties", () => {
    expect(
      capture({
        toolCallId: "call-1",
        toolName: "calculator",
        status: "complete",
        output: null,
      }).details,
    ).toContain('status must equal "success" or "error"');
    expect(
      capture({
        toolCallId: "call-1",
        toolName: "calculator",
        status: "success",
        output: null,
        provider: "ollama",
      }).details,
    ).toContain("result.provider is not supported");
  });
});

describe("failed tool results", () => {
  it("creates an immutable failure with optional details", () => {
    const details = { path: "file.txt", retryable: false };
    const result = failedToolResult(
      { id: "opaque-id", name: "read-file" },
      { code: "file.not_found", message: "File was not found.", details },
    );
    details.path = "changed";

    expect(result).toEqual({
      toolCallId: "opaque-id",
      toolName: "read-file",
      status: "error",
      error: {
        code: "file.not_found",
        message: "File was not found.",
        details: { path: "file.txt", retryable: false },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.error)).toBe(true);
    expect(Object.isFrozen(result.error.details)).toBe(true);
    expect(Object.isFrozen(details)).toBe(false);
  });

  it("accepts a failure without details and preserves message spacing", () => {
    const result = createToolResult({
      toolCallId: "call-1",
      toolName: "calculator",
      status: "error",
      error: { code: "tool_failed", message: "  Exact message.  " },
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.message).toBe("  Exact message.  ");
      expect("details" in result.error).toBe(false);
    }
  });

  it.each(["", "2invalid", "bad code", "x".repeat(129)])(
    "rejects invalid error code %j",
    (code) => {
      expect(
        capture({
          toolCallId: "call-1",
          toolName: "calculator",
          status: "error",
          error: { code, message: "Failed." },
        }).details.join("; "),
      ).toContain("error.code");
    },
  );

  it.each(["", "   ", "bad\0message", "x".repeat(4_001)])(
    "rejects invalid error message",
    (message) => {
      expect(
        capture({
          toolCallId: "call-1",
          toolName: "calculator",
          status: "error",
          error: { code: "failed", message },
        }).details.join("; "),
      ).toContain("error.message");
    },
  );

  it.each([undefined, new Error("failure"), Number.POSITIVE_INFINITY])(
    "rejects explicitly invalid details %#",
    (details) => {
      expect(
        capture({
          toolCallId: "call-1",
          toolName: "calculator",
          status: "error",
          error: { code: "failed", message: "Failed.", details },
        }).details.join("; "),
      ).toContain("error.details");
    },
  );

  it("rejects unknown error properties", () => {
    expect(
      capture({
        toolCallId: "call-1",
        toolName: "calculator",
        status: "error",
        error: { code: "failed", message: "Failed.", stack: "hidden" },
      }).details,
    ).toContain("error.stack is not supported");
  });
});

describe("tool execution context", () => {
  it("creates an empty frozen context", () => {
    const context = createToolExecutionContext();
    expect(context).toEqual({ metadata: {} });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.metadata)).toBe(true);
  });

  it("copies and freezes metadata and preserves the signal by identity", () => {
    const controller = new AbortController();
    const metadata = { traceId: "trace-1", nested: { count: 1 } };
    const context = createToolExecutionContext({
      signal: controller.signal,
      metadata,
    });
    (metadata.nested as { count: number }).count = 2;

    expect(context.signal).toBe(controller.signal);
    expect(Object.isFrozen(controller.signal)).toBe(false);
    expect(context.metadata).toEqual({
      traceId: "trace-1",
      nested: { count: 1 },
    });
    expect(Object.isFrozen(context.metadata)).toBe(true);
    expect(Object.isFrozen(context.metadata.nested)).toBe(true);
    expect(Object.isFrozen(metadata)).toBe(false);
  });

  it("accepts an already aborted signal without throwing its reason", () => {
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    expect(
      createToolExecutionContext({ signal: controller.signal }).signal,
    ).toBe(controller.signal);
  });

  it.each([null, [], "options"])("rejects invalid options %#", (options) => {
    expect(() => createToolExecutionContext(options as never)).toThrow(
      ToolContractError,
    );
  });

  it("rejects invalid and cyclic metadata and unknown options", () => {
    expect(() => createToolExecutionContext({ metadata: [] as never })).toThrow(
      "metadata must be a plain JSON object",
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      createToolExecutionContext({ metadata: cyclic as never }),
    ).toThrow("cyclic values");
    expect(() => createToolExecutionContext({ extra: true } as never)).toThrow(
      "options.extra is not supported",
    );
    expect(() => createToolExecutionContext({ signal: {} as never })).toThrow(
      "signal must be an AbortSignal",
    );
  });
});
