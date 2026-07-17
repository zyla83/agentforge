import { AgentForge } from "@agentforge/core";
import {
  exampleToolDefinitions,
  exampleTools,
  registerExampleTools,
} from "@agentforge/example-tools";
import {
  DuplicateToolError,
  type ToolDefinition,
  type ToolHandler,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe("example tool collections", () => {
  it("exports frozen associations and definitions in stable order", () => {
    expect(exampleToolDefinitions.map(({ name }) => name)).toEqual([
      "calculator",
      "format_text",
      "lookup_inventory",
    ]);
    expect(exampleTools.map(({ definition }) => definition)).toEqual(
      exampleToolDefinitions,
    );
    expect(Object.isFrozen(exampleTools)).toBe(true);
    expect(Object.isFrozen(exampleToolDefinitions)).toBe(true);
    expect(exampleTools.every(Object.isFrozen)).toBe(true);
  });
});

describe("registerExampleTools", () => {
  it("registers exact definition and handler identities without starting", () => {
    const registrations: {
      definition: Readonly<ToolDefinition>;
      handler: ToolHandler;
    }[] = [];
    const target = {
      started: false,
      registerTool(definition: Readonly<ToolDefinition>, handler: ToolHandler) {
        registrations.push({ definition, handler });
      },
    };
    registerExampleTools(target);
    expect(target.started).toBe(false);
    expect(registrations).toHaveLength(3);
    registrations.forEach((registration, index) => {
      expect(registration.definition).toBe(exampleTools[index]?.definition);
      expect(registration.handler).toBe(exampleTools[index]?.handler);
    });
  });

  it("propagates target errors and stops subsequent registration", () => {
    const error = new Error("registration failed");
    let calls = 0;
    expect(() =>
      registerExampleTools({
        registerTool() {
          calls += 1;
          if (calls === 2) throw error;
        },
      }),
    ).toThrow(error);
    expect(calls).toBe(2);
  });

  it("registers with AgentForge and surfaces duplicate errors", () => {
    const agent = new AgentForge();
    registerExampleTools(agent);
    expect(
      agent.getRegisteredToolDefinitions().map(({ name }) => name),
    ).toEqual(["calculator", "format_text", "lookup_inventory"]);
    expect(() => registerExampleTools(agent)).toThrow(DuplicateToolError);
    expect(agent.getRegisteredToolDefinitions()).toHaveLength(3);
  });
});
