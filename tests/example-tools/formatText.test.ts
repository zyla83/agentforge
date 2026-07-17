import {
  formatTextToolDefinition,
  formatTextToolHandler,
} from "@agentforge/example-tools";
import { createToolExecutionContext } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const context = createToolExecutionContext();

describe("format_text example tool", () => {
  it("exports an immutable enum and collection schema", () => {
    expect(formatTextToolDefinition.name).toBe("format_text");
    expect(formatTextToolDefinition.inputSchema).toMatchObject({
      type: "object",
      required: ["values", "format"],
      additionalProperties: false,
      properties: {
        values: { type: "array", minItems: 1, maxItems: 20 },
        format: {
          type: "string",
          enum: ["uppercase", "lowercase", "title_case"],
        },
      },
    });
    expect(Object.isFrozen(formatTextToolDefinition.inputSchema)).toBe(true);
  });

  it.each([
    ["uppercase", [" Alpha ", "Beta"], ["ALPHA", "BETA"], "ALPHA BETA"],
    ["lowercase", [" Alpha ", "BETA"], ["alpha", "beta"], "alpha beta"],
    [
      "title_case",
      [" hELLO   wORLD ", "żÓŁĆ"],
      ["Hello   World", "Żółć"],
      "Hello   World Żółć",
    ],
  ] as const)("applies %s", async (format, values, expectedValues, text) => {
    const output = await formatTextToolHandler({ values, format }, context);
    expect(output.values).toEqual(expectedValues);
    expect(output.text).toBe(text);
    expect(output.separator).toBe(" ");
    expect(output.trim).toBe(true);
  });

  it("supports a custom and empty separator", async () => {
    await expect(
      formatTextToolHandler(
        { values: ["a", "b"], format: "uppercase", separator: " | " },
        context,
      ),
    ).resolves.toMatchObject({ text: "A | B", separator: " | " });
    await expect(
      formatTextToolHandler(
        { values: ["a", "b"], format: "uppercase", separator: "" },
        context,
      ),
    ).resolves.toMatchObject({ text: "AB", separator: "" });
  });

  it("preserves surrounding and repeated whitespace when trim is false", async () => {
    const output = await formatTextToolHandler(
      { values: ["  hELLO   wORLD  "], format: "title_case", trim: false },
      context,
    );
    expect(output.values).toEqual(["  Hello   World  "]);
    expect(output.text).toBe("  Hello   World  ");
    expect(output.trim).toBe(false);
  });

  it("does not mutate its caller array and returns frozen fresh values", async () => {
    const values = [" first ", "second"];
    const before = [...values];
    const output = await formatTextToolHandler(
      { values, format: "uppercase" },
      context,
    );
    expect(values).toEqual(before);
    expect(Object.isFrozen(values)).toBe(false);
    expect(output.values).not.toBe(values);
    expect(Object.isFrozen(output.values)).toBe(true);
    expect(Object.isFrozen(output)).toBe(true);
  });

  it("defensively rejects an impossible format", async () => {
    await expect(
      formatTextToolHandler(
        { values: ["value"], format: "reverse" } as never,
        context,
      ),
    ).rejects.toThrow("Unsupported text format.");
  });
});
