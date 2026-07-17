import {
  DuplicateToolError,
  ToolNotFoundError,
  ToolRegistryError,
} from "@agentforge/provider-sdk";
import type {
  RegisteredTool,
  ToolDefinition,
  ToolHandler,
  ToolRegistry,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe("tool registry contracts", () => {
  it("supports the registered-tool and read-only registry shapes", () => {
    const definition: ToolDefinition = {
      name: "example",
      description: "Example tool.",
      inputSchema: { type: "object" },
    };
    const handler: ToolHandler = async () => null;
    const registered: RegisteredTool = { definition, handler };
    const registry: ToolRegistry = {
      has: () => true,
      get: () => registered,
      require: () => registered,
      getDefinition: () => definition,
      list: () => [registered],
      listDefinitions: () => [definition],
    };

    expect(registry.get("example")?.handler).toBe(handler);
    expect("register" in registry).toBe(false);
  });
});

describe.each([
  [
    DuplicateToolError,
    "DuplicateToolError",
    'A tool named "calculator" is already registered.',
  ],
  [
    ToolNotFoundError,
    "ToolNotFoundError",
    'Tool "calculator" is not registered.',
  ],
])("%s", (ErrorClass, name, message) => {
  it("preserves hierarchy, name, exact tool name, message, and cause", () => {
    const cause = new Error("cause");
    const error = new ErrorClass("calculator", { cause });
    expect(error).toBeInstanceOf(ToolRegistryError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.toolName).toBe("calculator");
    expect(error.message).toBe(message);
    expect(error.cause).toBe(cause);
  });
});

describe("ToolRegistryError", () => {
  it("sets its name and preserves cause", () => {
    const cause = new Error("cause");
    const error = new ToolRegistryError("Registry failed.", { cause });
    expect(error.name).toBe("ToolRegistryError");
    expect(error.cause).toBe(cause);
  });
});
