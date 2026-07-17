import { AgentForge, AgentForgeState } from "@agentforge/core";
import type { LogContext, Logger } from "@agentforge/logger";
import type { Plugin } from "@agentforge/plugin-sdk";
import {
  DuplicateToolError,
  InvalidToolDefinitionError,
  ToolNotFoundError,
  ToolRegistryError,
} from "@agentforge/provider-sdk";
import type {
  LLMProvider,
  ToolDefinition,
  ToolHandler,
} from "@agentforge/provider-sdk";
import type { InvalidLifecycleOperationError } from "@agentforge/shared";
import { describe, expect, it } from "vitest";

function definition(name = "calculator"): ToolDefinition {
  return {
    name,
    description: "A private application schema description.",
    inputSchema: { type: "object", additionalProperties: false },
  };
}

const handler: ToolHandler = async () => null;

describe("AgentForge tool registration", () => {
  it("registers fluently and exposes immutable lookup APIs", () => {
    const agent = new AgentForge();
    expect(agent.registerTool(definition(), handler)).toBe(agent);

    const registered = agent.getTool("calculator");
    expect(agent.hasTool("calculator")).toBe(true);
    expect(agent.hasTool("Calculator")).toBe(false);
    expect(registered?.handler).toBe(handler);
    expect(agent.requireTool("calculator")).toBe(registered);
    expect(agent.getToolDefinition("calculator")).toBe(registered?.definition);
    expect(agent.getRegisteredTools()).toEqual([registered]);
    expect(agent.getRegisteredToolDefinitions()).toEqual([
      registered?.definition,
    ]);
    expect(Object.isFrozen(agent.getRegisteredTools())).toBe(true);
    expect(Object.isFrozen(agent.getRegisteredToolDefinitions())).toBe(true);
  });

  it("preserves registration order and case-sensitive distinct names", () => {
    const agent = new AgentForge()
      .registerTool(definition("B"), handler)
      .registerTool(definition("A"), handler)
      .registerTool(definition("Calculator"), handler)
      .registerTool(definition("calculator"), handler);
    expect(
      agent.getRegisteredToolDefinitions().map(({ name }) => name),
    ).toEqual(["B", "A", "Calculator", "calculator"]);
  });

  it("rejects duplicate, invalid definition, and invalid handler registrations", () => {
    const agent = new AgentForge().registerTool(definition(), handler);
    expect(() => agent.registerTool(definition(), handler)).toThrow(
      DuplicateToolError,
    );
    expect(() =>
      new AgentForge().registerTool(definition("bad name"), handler),
    ).toThrow(InvalidToolDefinitionError);
    expect(() =>
      new AgentForge().registerTool(definition(), null as never),
    ).toThrow(ToolRegistryError);
    expect(agent.getRegisteredTools()).toHaveLength(1);
  });

  it("provides strict missing lookup without changing safe lookup behavior", () => {
    const agent = new AgentForge();
    expect(agent.hasTool(42 as never)).toBe(false);
    expect(agent.getTool(null as never)).toBeUndefined();
    expect(agent.getToolDefinition("bad name")).toBeUndefined();
    expect(() => agent.requireTool("missing")).toThrow(ToolNotFoundError);
  });

  it("does not invoke handlers during registration or inspection", () => {
    let calls = 0;
    const countingHandler: ToolHandler = async () => {
      calls += 1;
      return null;
    };
    const agent = new AgentForge().registerTool(definition(), countingHandler);
    agent.hasTool("calculator");
    agent.getTool("calculator");
    agent.getRegisteredTools();
    expect(calls).toBe(0);
  });

  it("forbids registration while running and after stop but allows lookup", async () => {
    const agent = new AgentForge().registerTool(definition(), handler);
    await agent.start();
    expect(() => agent.registerTool(definition("later"), handler)).toThrow(
      expect.objectContaining<Partial<InvalidLifecycleOperationError>>({
        operation: "register a tool",
        state: AgentForgeState.Running,
      }),
    );
    expect(agent.getTool("calculator")?.handler).toBe(handler);
    await agent.stop();
    expect(() => agent.registerTool(definition("later"), handler)).toThrow(
      expect.objectContaining<Partial<InvalidLifecycleOperationError>>({
        state: AgentForgeState.Stopped,
      }),
    );
    expect(agent.hasTool("calculator")).toBe(true);
  });

  it("forbids plugin-time registration while starting", async () => {
    const agent = new AgentForge();
    const plugin: Plugin = {
      metadata: { name: "registrar", version: "1.0.0" },
      async initialize() {
        agent.registerTool(definition("late"), handler);
      },
    };
    agent.register(plugin);
    await expect(agent.start()).rejects.toMatchObject({
      cause: expect.objectContaining({
        name: "InvalidLifecycleOperationError",
        state: AgentForgeState.Starting,
      }),
    });
    expect(agent.getState()).toBe(AgentForgeState.Failed);
    expect(agent.hasTool("late")).toBe(false);
    expect(() => agent.registerTool(definition("failed"), handler)).toThrow(
      expect.objectContaining<Partial<InvalidLifecycleOperationError>>({
        state: AgentForgeState.Failed,
      }),
    );
  });

  it("forbids registration while stopping", async () => {
    const agent = new AgentForge();
    const plugin: Plugin = {
      metadata: { name: "shutdown-registrar", version: "1.0.0" },
      async initialize() {},
      async shutdown() {
        agent.registerTool(definition("late"), handler);
      },
    };
    agent.register(plugin);
    await agent.start();
    await expect(agent.stop()).rejects.toMatchObject({
      failures: [
        expect.objectContaining({
          error: expect.objectContaining({
            name: "InvalidLifecycleOperationError",
            state: AgentForgeState.Stopping,
          }),
        }),
      ],
    });
    expect(agent.getState()).toBe(AgentForgeState.Failed);
    expect(agent.hasTool("late")).toBe(false);
  });

  it("coexists with plugin and provider registration", () => {
    const plugin: Plugin = {
      metadata: { name: "example", version: "1.0.0" },
      async initialize() {},
    };
    const provider = {
      metadata: { name: "example-provider", version: "1.0.0" },
    } as LLMProvider;
    const agent = new AgentForge()
      .register(plugin)
      .registerLLMProvider(provider)
      .registerTool(definition(), handler);
    expect(agent.getPluginCount()).toBe(1);
    expect(agent.getLLMProvider("example-provider")).toBe(provider);
    expect(agent.getTool("calculator")?.handler).toBe(handler);
  });

  it("logs only the tool name for successful registration", () => {
    const records: LogRecord[] = [];
    const logger = new RecordingLogger(records);
    const secretHandler: ToolHandler = async function secretHandler() {
      return null;
    };
    new AgentForge(undefined, { logger }).registerTool(
      definition(),
      secretHandler,
    );
    const record = records.find(({ message }) => message === "Tool registered");
    expect(record?.context).toEqual({ toolName: "calculator" });
    expect(JSON.stringify(record)).not.toContain("private application schema");
    expect(JSON.stringify(record)).not.toContain("secretHandler");
  });
});

interface LogRecord {
  readonly level: string;
  readonly message: string;
  readonly context?: LogContext;
}

class RecordingLogger implements Logger {
  constructor(private readonly records: LogRecord[]) {}
  trace(message: string, context?: LogContext): void {
    this.record("trace", message, context);
  }
  debug(message: string, context?: LogContext): void {
    this.record("debug", message, context);
  }
  info(message: string, context?: LogContext): void {
    this.record("info", message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.record("warn", message, context);
  }
  error(message: string, context?: LogContext): void {
    this.record("error", message, context);
  }
  child(_bindings: LogContext): Logger {
    return new RecordingLogger(this.records);
  }
  private record(level: string, message: string, context?: LogContext): void {
    this.records.push(
      context === undefined ? { level, message } : { level, message, context },
    );
  }
}
