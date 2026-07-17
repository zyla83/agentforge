import {
  DuplicateToolError,
  InvalidToolDefinitionError,
  ToolNotFoundError,
  ToolRegistryError,
} from "@agentforge/provider-sdk";
import type { ToolDefinition, ToolHandler } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { ToolRegistryImpl } from "../../../packages/core/src/tools/ToolRegistryImpl.js";

function definition(name = "calculator"): ToolDefinition {
  return {
    name,
    description: `${name} tool.`,
    inputSchema: {
      type: "object",
      properties: { value: { type: "number" } },
      additionalProperties: false,
    },
  };
}

const handler: ToolHandler = async () => null;

describe("ToolRegistryImpl", () => {
  it("provides empty immutable results", () => {
    const registry = new ToolRegistryImpl();
    expect(registry.has("calculator")).toBe(false);
    expect(registry.get("calculator")).toBeUndefined();
    expect(registry.getDefinition("calculator")).toBeUndefined();
    expect(registry.list()).toEqual([]);
    expect(registry.listDefinitions()).toEqual([]);
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.listDefinitions())).toBe(true);
  });

  it("registers an immutable snapshot and preserves handler identity", () => {
    const registry = new ToolRegistryImpl();
    const properties: Record<string, { type: "number" }> = {
      value: { type: "number" },
    };
    const source = {
      name: "calculator",
      description: "Calculator tool.",
      inputSchema: { type: "object" as const, properties },
    };
    const registered = registry.register(source, handler);
    properties.changed = { type: "number" };

    expect(registered.handler).toBe(handler);
    expect(registered.definition).toBe(registry.getDefinition("calculator"));
    expect(registered).toBe(registry.get("calculator"));
    expect(registered.definition.inputSchema.properties).not.toHaveProperty(
      "changed",
    );
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.definition)).toBe(true);
    expect(Object.isFrozen(registered.definition.inputSchema)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.inputSchema)).toBe(false);
    expect(Object.isFrozen(properties)).toBe(false);
  });

  it("preserves case-sensitive exact lookup and registration order", () => {
    const registry = new ToolRegistryImpl();
    registry.register(definition("B"), handler);
    registry.register(definition("A"), handler);
    registry.register(definition("Calculator"), handler);
    registry.register(definition("calculator"), handler);

    expect(registry.has("Calculator")).toBe(true);
    expect(registry.has("CALCULATOR")).toBe(false);
    expect(registry.listDefinitions().map(({ name }) => name)).toEqual([
      "B",
      "A",
      "Calculator",
      "calculator",
    ]);
  });

  it("returns fresh frozen arrays that cannot affect the registry", () => {
    const registry = new ToolRegistryImpl();
    registry.register(definition("first"), handler);
    registry.register(definition("second"), handler);
    const first = registry.list();
    const second = registry.list();

    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => (first as Readonly<unknown>[]).reverse()).toThrow();
    expect(registry.listDefinitions().map(({ name }) => name)).toEqual([
      "first",
      "second",
    ]);
  });

  it("rejects duplicates without changing the original or order", () => {
    const registry = new ToolRegistryImpl();
    const original = registry.register(definition(), handler);
    const replacement: ToolHandler = async () => "replacement";

    expect(() => registry.register(definition(), replacement)).toThrow(
      DuplicateToolError,
    );
    expect(registry.list()).toEqual([original]);
    expect(registry.get("calculator")?.handler).toBe(handler);
  });

  it("rejects invalid definitions and handlers without mutation", () => {
    const registry = new ToolRegistryImpl();
    expect(() =>
      registry.register({ ...definition(), name: "bad name" }, handler),
    ).toThrow(InvalidToolDefinitionError);
    expect(() => registry.register(definition(), 42 as never)).toThrow(
      expect.objectContaining({
        message: "Tool registration is invalid: handler must be a function.",
      }),
    );
    expect(registry.list()).toEqual([]);
  });

  it("requires existing tools and distinguishes missing from malformed names", () => {
    const registry = new ToolRegistryImpl();
    const registered = registry.register(definition(), handler);
    expect(registry.require("calculator")).toBe(registered);
    expect(() => registry.require("missing")).toThrow(ToolNotFoundError);
    expect(() => registry.require("bad name")).toThrow(ToolRegistryError);
  });

  it.each([42, null, undefined, {}, [], " bad", "tool.name"])(
    "returns safe missing values for malformed lookup %#",
    (name) => {
      const registry = new ToolRegistryImpl();
      registry.register(definition(), handler);
      expect(registry.has(name as never)).toBe(false);
      expect(registry.get(name as never)).toBeUndefined();
      expect(registry.getDefinition(name as never)).toBeUndefined();
    },
  );

  it("exposes a stable frozen view without mutation methods", () => {
    const registry = new ToolRegistryImpl();
    const view = registry.getView();
    expect(view).toBe(registry.getView());
    expect(Object.isFrozen(view)).toBe(true);
    expect("register" in view).toBe(false);
    registry.register(definition(), handler);
    expect(view.has("calculator")).toBe(true);
    expect(view.get("calculator")?.handler).toBe(handler);
  });
});
