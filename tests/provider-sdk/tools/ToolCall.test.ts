import {
  InvalidToolCallError,
  createToolCall,
  validateToolCall,
} from "@agentforge/provider-sdk";
import type { ToolCall } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function call(overrides: Partial<ToolCall> = {}): ToolCall {
  return { id: "call-1", name: "calculator", arguments: {}, ...overrides };
}

function capture(value: unknown): InvalidToolCallError {
  try {
    validateToolCall(value as ToolCall);
  } catch (error) {
    if (error instanceof InvalidToolCallError) return error;
    throw error;
  }
  throw new Error("Expected tool call validation to fail.");
}

describe("tool calls", () => {
  it("accepts empty and nested JSON arguments", () => {
    expect(createToolCall(call()).arguments).toEqual({});
    const result = createToolCall(
      call({
        arguments: {
          text: "Zażółć 👋",
          count: 2.5,
          active: true,
          nullable: null,
          nested: { values: [1, "two", false, null] },
        },
      }),
    );
    expect(result.arguments).toEqual({
      text: "Zażółć 👋",
      count: 2.5,
      active: true,
      nullable: null,
      nested: { values: [1, "two", false, null] },
    });
  });

  it("deeply copies and freezes arguments without freezing caller data", () => {
    const nested = { values: [1, 2] };
    const argumentsValue = { nested };
    const result = createToolCall(call({ arguments: argumentsValue }));
    nested.values.push(3);

    expect(result.arguments).toEqual({ nested: { values: [1, 2] } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.arguments)).toBe(true);
    expect(Object.isFrozen(result.arguments.nested)).toBe(true);
    expect(
      Object.isFrozen((result.arguments.nested as { values: number[] }).values),
    ).toBe(true);
    expect(Object.isFrozen(argumentsValue)).toBe(false);
    expect(Object.isFrozen(nested)).toBe(false);
  });

  it.each(["", "   ", "x".repeat(257), "bad\0id"])(
    "rejects invalid call ID %j",
    (id) => expect(capture(call({ id })).details.join("; ")).toContain("id"),
  );

  it("preserves opaque IDs and case-sensitive tool names exactly", () => {
    const result = createToolCall(
      call({ id: "  provider:id  ", name: "Weather2" }),
    );
    expect(result.id).toBe("  provider:id  ");
    expect(result.name).toBe("Weather2");
  });

  it.each(["bad name", "2tool", "tool.name"])(
    "rejects invalid name %j",
    (name) =>
      expect(capture(call({ name })).details.join("; ")).toContain("name"),
  );

  it.each([null, [], new (class Arguments {})()])(
    "rejects non-object arguments %#",
    (argumentsValue) => {
      expect(
        capture(call({ arguments: argumentsValue as never })).details,
      ).toContain("arguments must be a plain JSON object");
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite number %s",
    (number) => {
      expect(
        capture(call({ arguments: { nested: number } })).details.join("; "),
      ).toContain("finite numbers");
    },
  );

  it.each([
    undefined,
    () => undefined,
    Symbol("value"),
    1n,
    new Date(),
    new Map(),
  ])("rejects unsupported nested value %#", (value) => {
    expect(
      capture(call({ arguments: { nested: value } as never })).details.join(
        "; ",
      ),
    ).toContain("valid JSON");
  });

  it("rejects sparse arrays", () => {
    const sparse = new Array(2);
    sparse[1] = "value";
    expect(
      capture(call({ arguments: { sparse } as never })).details.join("; "),
    ).toContain("must not be sparse");
  });

  it("rejects cyclic arguments", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      capture(call({ arguments: cyclic as never })).details.join("; "),
    ).toContain("cyclic values");
  });

  it("rejects symbol keys, accessors, and unknown call properties", () => {
    const symbolArguments = { value: 1, [Symbol("secret")]: true };
    expect(
      capture(call({ arguments: symbolArguments })).details.join("; "),
    ).toContain("symbol keys");

    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });
    expect(
      capture(call({ arguments: accessor as never })).details.join("; "),
    ).toContain("data property");

    expect(capture({ ...call(), provider: "ollama" }).details).toContain(
      "call.provider is not supported",
    );
  });
});
