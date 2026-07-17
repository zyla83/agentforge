import {
  InvalidToolDefinitionError,
  createToolDefinition,
  validateToolDefinition,
} from "@agentforge/provider-sdk";
import type { ToolDefinition } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function definition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "calculator",
    description: "Evaluate an expression.",
    inputSchema: { type: "object" },
    ...overrides,
  };
}

function capture(value: unknown): InvalidToolDefinitionError {
  try {
    validateToolDefinition(value as ToolDefinition);
  } catch (error) {
    if (error instanceof InvalidToolDefinitionError) return error;
    throw error;
  }
  throw new Error("Expected tool definition validation to fail.");
}

describe("tool definitions", () => {
  it("creates a minimal immutable definition", () => {
    const result = createToolDefinition(definition());
    expect(result).toEqual(definition());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.inputSchema)).toBe(true);
  });

  it("copies and deeply freezes a complete nested schema", () => {
    const expression = {
      type: "string" as const,
      description: "Expression.",
      enum: ["1+1", "2+2"],
      minLength: 1,
      maxLength: 100,
    };
    const inputSchema = {
      type: "object" as const,
      properties: {
        expression,
        operands: {
          type: "array" as const,
          items: { type: "number" as const, minimum: -100, maximum: 100 },
          minItems: 1,
          maxItems: 10,
        },
      },
      required: ["expression"],
      additionalProperties: false,
    };
    const source = definition({ inputSchema });
    const result = createToolDefinition(source);

    expression.enum.push("3+3");
    inputSchema.required.push("operands");

    expect(result.inputSchema.properties?.expression.enum).toEqual([
      "1+1",
      "2+2",
    ]);
    expect(result.inputSchema.required).toEqual(["expression"]);
    expect(Object.isFrozen(result.inputSchema.properties)).toBe(true);
    expect(Object.isFrozen(result.inputSchema.properties?.expression)).toBe(
      true,
    );
    expect(
      Object.isFrozen(result.inputSchema.properties?.expression.enum),
    ).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(inputSchema)).toBe(false);
    expect(Object.isFrozen(expression)).toBe(false);
  });

  it.each(["calculator", "current_time", "read-file", "Weather2", "A"])(
    "accepts valid tool name %s",
    (name) =>
      expect(() => createToolDefinition(definition({ name }))).not.toThrow(),
  );

  it.each([
    "",
    " calculator",
    "calculator ",
    "2calculator",
    "tool.name",
    "tool/name",
    "tool name",
    `a${"x".repeat(64)}`,
  ])("rejects invalid tool name %j", (name) => {
    expect(capture(definition({ name })).details).toContainEqual(
      expect.stringContaining("name"),
    );
  });

  it("preserves descriptions and rejects invalid descriptions", () => {
    const spaced = "  Exact description.  ";
    expect(
      createToolDefinition(definition({ description: spaced })).description,
    ).toBe(spaced);
    expect(capture(definition({ description: "  " })).details).toContain(
      "description must be a non-empty string",
    );
    expect(
      capture(definition({ description: "x".repeat(2_001) })).details,
    ).toContain("description must contain at most 2000 characters");
    expect(
      capture(definition({ description: "bad\0value" })).details,
    ).toContain("description must not contain NUL characters");
  });

  it("rejects unknown definition and schema fields", () => {
    expect(capture({ ...definition(), extra: true }).details).toContain(
      "definition.extra is not supported",
    );
    expect(
      capture(
        definition({ inputSchema: { type: "object", pattern: "x" } as never }),
      ).details,
    ).toContain("inputSchema.pattern is not supported");
  });

  it("requires a top-level object schema", () => {
    expect(
      capture(definition({ inputSchema: { type: "string" } as never })).details,
    ).toContain('inputSchema.type must equal "object"');
  });

  it.each([
    [{ type: "string", minItems: 1 }, "minItems is not valid"],
    [
      { type: "array", items: { type: "string" }, minLength: 1 },
      "minLength is not valid",
    ],
    [{ type: "boolean", minimum: 0 }, "minimum is not valid"],
  ])("rejects incompatible schema keywords", (propertySchema, detail) => {
    const error = capture(
      definition({
        inputSchema: {
          type: "object",
          properties: { value: propertySchema as never },
        },
      }),
    );
    expect(error.details.join("; ")).toContain(detail);
  });

  it("validates required property relationships", () => {
    const duplicate = capture(
      definition({
        inputSchema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value", "value", "missing"],
        },
      }),
    );
    expect(duplicate.details).toContain(
      "inputSchema.required[1] must be unique",
    );
    expect(duplicate.details).toContain(
      "inputSchema.required[2] must reference a declared property",
    );
  });

  it.each([
    [{ type: "string", enum: [] }, "enum must be a non-empty array"],
    [{ type: "string", enum: ["x", "x"] }, "must not duplicate"],
    [{ type: "integer", enum: [1.5] }, 'must match schema type "integer"'],
    [{ type: "string", enum: ["x"], const: "y" }, "const must be included"],
    [{ type: "number", const: Number.NaN }, "const must be a JSON primitive"],
  ])("rejects malformed enum or const", (propertySchema, detail) => {
    const error = capture(
      definition({
        inputSchema: {
          type: "object",
          properties: { value: propertySchema as never },
        },
      }),
    );
    expect(error.details.join("; ")).toContain(detail);
  });

  it.each([
    [
      { type: "array", items: { type: "string" }, minItems: -1 },
      "non-negative finite integer",
    ],
    [
      { type: "array", items: { type: "string" }, minItems: 3, maxItems: 2 },
      "less than or equal",
    ],
    [{ type: "string", minLength: 4, maxLength: 3 }, "less than or equal"],
    [{ type: "number", minimum: Number.NaN }, "finite number"],
    [{ type: "number", minimum: 2, maximum: 1 }, "less than or equal"],
    [{ type: "array" }, "items is required"],
  ])("rejects invalid schema limits", (propertySchema, detail) => {
    const error = capture(
      definition({
        inputSchema: {
          type: "object",
          properties: { value: propertySchema as never },
        },
      }),
    );
    expect(error.details.join("; ")).toContain(detail);
  });

  it("rejects cyclic and class-instance schemas", () => {
    const cyclic: Record<string, unknown> = { type: "object" };
    cyclic.properties = { self: cyclic };
    expect(
      capture(definition({ inputSchema: cyclic as never })).details.join("; "),
    ).toContain("cyclic schemas");

    class Schema {
      type = "object";
    }
    expect(
      capture(definition({ inputSchema: new Schema() as never })).details,
    ).toContain("inputSchema must be a plain object");
  });
});
