import {
  InvalidToolArgumentsError,
  validateToolArguments,
} from "@agentforge/core";
import type { ToolDefinition } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function definition(
  inputSchema: ToolDefinition["inputSchema"],
): ToolDefinition {
  return { name: "validate", description: "Validate arguments.", inputSchema };
}

describe("validateToolArguments", () => {
  it("validates nested values and returns a deeply immutable snapshot", () => {
    const source = {
      location: { name: "Łódź", coordinates: [51.77, 19.46] },
      units: "metric",
      retries: 2,
      active: true,
      note: null,
    };
    const result = validateToolArguments(
      definition({
        type: "object",
        required: ["location", "units"],
        additionalProperties: false,
        properties: {
          location: {
            type: "object",
            required: ["name", "coordinates"],
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 2, maxLength: 20 },
              coordinates: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: { type: "number", minimum: -180, maximum: 180 },
              },
            },
          },
          units: { type: "string", enum: ["metric", "imperial"] },
          retries: { type: "integer", minimum: 0, maximum: 3 },
          active: { type: "boolean", const: true },
          note: { type: "null" },
        },
      }),
      source,
    );
    source.location.name = "changed";
    expect(result.location).toEqual({
      name: "Łódź",
      coordinates: [51.77, 19.46],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.location)).toBe(true);
    expect(
      Object.isFrozen(
        (result.location as { coordinates: unknown }).coordinates,
      ),
    ).toBe(true);
  });

  it("allows unspecified additional properties by default", () => {
    expect(
      validateToolArguments(definition({ type: "object" }), {
        extra: [1, true],
      }),
    ).toEqual({ extra: [1, true] });
  });

  it("validates schema-valued additional properties", () => {
    expect(() =>
      validateToolArguments(
        definition({
          type: "object",
          additionalProperties: { type: "string" },
        }),
        { valid: "yes", invalid: 42 },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<InvalidToolArgumentsError>>({
        details: ["arguments.invalid must be a string"],
      }),
    );
  });

  it("accumulates deterministic paths without coercion", () => {
    try {
      validateToolArguments(
        definition({
          type: "object",
          required: ["location", "count"],
          additionalProperties: false,
          properties: {
            location: { type: "string" },
            count: { type: "integer" },
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string", minLength: 2 } },
              },
            },
          },
        }),
        { count: "2", items: [{ name: "" }, {}], extra: true } as never,
      );
      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidToolArgumentsError);
      expect((error as InvalidToolArgumentsError).details).toEqual([
        "arguments.location is required",
        "arguments.count must be an integer",
        "arguments.items[0].name must contain at least 2 characters",
        "arguments.items[1].name is required",
        "arguments.extra is not allowed",
      ]);
    }
  });

  it.each([
    [
      { value: [1] },
      { type: "array", items: { type: "number" }, minItems: 2 },
      "arguments.value must contain at least 2 items",
    ],
    [
      { value: [1, 2, 3] },
      { type: "array", items: { type: "number" }, maxItems: 2 },
      "arguments.value must contain at most 2 items",
    ],
    [{ value: 1.5 }, { type: "integer" }, "arguments.value must be an integer"],
    [
      { value: -1 },
      { type: "number", minimum: 0 },
      "arguments.value must be at least 0",
    ],
    [
      { value: 11 },
      { type: "number", maximum: 10 },
      "arguments.value must be at most 10",
    ],
    [
      { value: "x" },
      { type: "string", const: "y" },
      'arguments.value must equal "y"',
    ],
  ] as const)(
    "enforces schema constraint %#",
    (argumentsValue, schema, detail) => {
      expect(() =>
        validateToolArguments(
          definition({ type: "object", properties: { value: schema } }),
          argumentsValue,
        ),
      ).toThrowError(expect.objectContaining({ details: [detail] }));
    },
  );
});
