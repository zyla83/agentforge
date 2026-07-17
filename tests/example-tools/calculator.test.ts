import {
  calculatorToolDefinition,
  calculatorToolHandler,
} from "@agentforge/example-tools";
import { createToolExecutionContext } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const context = createToolExecutionContext();

describe("calculator example tool", () => {
  it("exports the canonical definition and schema", () => {
    expect(calculatorToolDefinition).toEqual({
      name: "calculator",
      description: "Perform one arithmetic operation on two finite numbers.",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["add", "subtract", "multiply", "divide"],
          },
          left: { type: "number" },
          right: { type: "number" },
        },
        required: ["operation", "left", "right"],
        additionalProperties: false,
      },
    });
    expect(Object.isFrozen(calculatorToolDefinition)).toBe(true);
  });

  it.each([
    ["add", 2, 3, 5],
    ["subtract", 8, 3, 5],
    ["multiply", 4, 2.5, 10],
    ["divide", 9, 3, 3],
    ["add", -4.5, 1.5, -3],
  ] as const)("performs %s", async (operation, left, right, expected) => {
    await expect(
      calculatorToolHandler({ operation, left, right }, context),
    ).resolves.toEqual({ operation, left, right, result: expected });
  });

  it("normalizes negative zero and returns valid JSON", async () => {
    const output = await calculatorToolHandler(
      { operation: "multiply", left: -0, right: 1 },
      context,
    );
    expect(Object.is(output.result, -0)).toBe(false);
    expect(output.result).toBe(0);
    expect(() => JSON.stringify(output)).not.toThrow();
    expect(Object.isFrozen(output)).toBe(true);
  });

  it("rejects division by zero", async () => {
    await expect(
      calculatorToolHandler(
        { operation: "divide", left: 1, right: 0 },
        context,
      ),
    ).rejects.toThrow("Division by zero is not allowed.");
  });

  it("rejects a non-finite arithmetic result", async () => {
    await expect(
      calculatorToolHandler(
        {
          operation: "multiply",
          left: Number.MAX_VALUE,
          right: Number.MAX_VALUE,
        },
        context,
      ),
    ).rejects.toThrow("Calculator result must be finite.");
  });

  it("does not mutate or freeze caller input", async () => {
    const input = { operation: "add" as const, left: 2, right: 3 };
    const before = structuredClone(input);
    await calculatorToolHandler(input, context);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("defensively rejects an impossible operation", async () => {
    await expect(
      calculatorToolHandler(
        { operation: "power", left: 2, right: 3 } as never,
        context,
      ),
    ).rejects.toThrow("Unsupported calculator operation.");
  });
});
