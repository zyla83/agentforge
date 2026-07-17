import { AgentForge } from "@agentforge/core";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";
import type { ToolDefinition, ToolHandler } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const firstHandler: ToolHandler = async () => "first";
const secondHandler: ToolHandler = async () => "second";

function definition(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool.`,
    inputSchema: { type: "object", properties: {} },
  };
}

describe("PluginContext tool registry", () => {
  it("exposes a read-only ordered registry with immutable snapshots", async () => {
    let context: PluginContext | undefined;
    const plugin: Plugin = {
      metadata: { name: "inspector", version: "1.0.0" },
      async initialize(value) {
        context = value;
      },
    };
    const agent = new AgentForge()
      .registerTool(definition("first"), firstHandler)
      .registerTool(definition("second"), secondHandler)
      .register(plugin);

    await agent.start();

    const tools = context?.tools;
    expect(tools).toBeDefined();
    expect(Object.isFrozen(tools)).toBe(true);
    expect("register" in (tools as object)).toBe(false);
    expect(tools?.listDefinitions().map(({ name }) => name)).toEqual([
      "first",
      "second",
    ]);
    expect(tools?.get("first")?.handler).toBe(firstHandler);
    expect(Object.isFrozen(tools?.get("first"))).toBe(true);
    expect(Object.isFrozen(tools?.getDefinition("first"))).toBe(true);
    const listed = tools?.list() ?? [];
    expect(Object.isFrozen(listed)).toBe(true);
    expect(() => (listed as unknown[]).reverse()).toThrow();
    expect(() => {
      (tools?.getDefinition("first") as { name: string }).name = "changed";
    }).toThrow();
    expect(tools?.has("first")).toBe(true);
    expect(tools?.has("changed")).toBe(false);

    await agent.stop();
  });
});
