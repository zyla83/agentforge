import { AgentForge, AgentForgeState } from "@agentforge/core";
import type { Plugin, PluginMetadata } from "@agentforge/plugin-sdk";
import {
  DuplicatePluginError,
  PluginInitializationError,
  PluginShutdownError,
} from "@agentforge/shared";
import { describe, expect, it } from "vitest";

interface PluginHooks {
  initialize?(): Promise<void> | void;
  shutdown?(): Promise<void> | void;
}

function createPlugin(
  name: string,
  version = "1.0.0",
  description?: string,
  hooks: PluginHooks = {},
): Plugin {
  const metadata: PluginMetadata = description
    ? { name, version, description }
    : { name, version };

  return {
    metadata,
    async initialize() {
      await hooks.initialize?.();
    },
    async shutdown() {
      await hooks.shutdown?.();
    },
  };
}

function expectRegistry(
  agent: AgentForge,
  expected: readonly Readonly<PluginMetadata>[],
): void {
  expect(agent.getPluginCount()).toBe(expected.length);
  expect(agent.getRegisteredPlugins()).toEqual(expected);

  for (const metadata of expected) {
    expect(agent.hasPlugin(metadata.name)).toBe(true);
    expect(agent.getPluginMetadata(metadata.name)).toEqual(metadata);
  }
}

describe("AgentForge plugin registry", () => {
  it("exposes an empty frozen registry", () => {
    const agent = new AgentForge();
    const plugins = agent.getRegisteredPlugins();

    expect(agent.getPluginCount()).toBe(0);
    expect(agent.hasPlugin("example")).toBe(false);
    expect(agent.getPluginMetadata("example")).toBeUndefined();
    expect(plugins).toEqual([]);
    expect(Object.isFrozen(plugins)).toBe(true);
  });

  it("looks up validated metadata by exact name", () => {
    const originalMetadata = {
      name: "example",
      version: "1.2.3",
      description: "Example plugin",
    };
    const plugin: Plugin = {
      metadata: originalMetadata,
      async initialize() {},
    };
    const agent = new AgentForge().register(plugin);
    const metadata = agent.getPluginMetadata("example");

    expect(agent.hasPlugin("example")).toBe(true);
    expect(metadata).toEqual(originalMetadata);
    expect(metadata).not.toBe(originalMetadata);
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(agent.hasPlugin("Example")).toBe(false);
    expect(agent.hasPlugin(" example ")).toBe(false);
    expect(agent.getPluginMetadata("Example")).toBeUndefined();
    expect(agent.getPluginMetadata(" example ")).toBeUndefined();
    expect(agent.getPluginMetadata("unknown")).toBeUndefined();
  });

  it("safely handles malformed runtime lookup values", () => {
    const agent = new AgentForge().register(createPlugin("example"));
    const malformedValues = [42, null, undefined, {}, []];

    for (const value of malformedValues) {
      const name = value as unknown as string;
      expect(agent.hasPlugin(name)).toBe(false);
      expect(agent.getPluginMetadata(name)).toBeUndefined();
    }
  });

  it("lists frozen metadata snapshots in registration order", () => {
    const agent = new AgentForge()
      .register(createPlugin("database", "1.0.0", "Database plugin"))
      .register(createPlugin("assistant", "2.0.0"));
    const firstResult = agent.getRegisteredPlugins();
    const secondResult = agent.getRegisteredPlugins();

    expect(firstResult).toEqual([
      {
        name: "database",
        version: "1.0.0",
        description: "Database plugin",
      },
      { name: "assistant", version: "2.0.0" },
    ]);
    expect(Object.isFrozen(firstResult)).toBe(true);
    expect(firstResult.every(Object.isFrozen)).toBe(true);
    expect(firstResult).not.toBe(secondResult);
    expect(firstResult[0]).toBe(secondResult[0]);
  });

  it("prevents returned arrays from changing the internal registry", () => {
    const agent = new AgentForge()
      .register(createPlugin("first"))
      .register(createPlugin("second"));
    const plugins = agent.getRegisteredPlugins();

    expect(() =>
      (plugins as PluginMetadata[]).push({
        name: "injected",
        version: "1.0.0",
      }),
    ).toThrow(TypeError);
    expect(() => (plugins as PluginMetadata[]).reverse()).toThrow(TypeError);

    expect(agent.getPluginCount()).toBe(2);
    expect(agent.hasPlugin("injected")).toBe(false);
    expect(agent.getRegisteredPlugins().map(({ name }) => name)).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps snapshots stable when original metadata is mutated or replaced", () => {
    const originalMetadata = {
      name: "original",
      version: "1.0.0",
      description: "Original description",
    };
    const plugin: Plugin = {
      metadata: originalMetadata,
      async initialize() {},
    };
    const agent = new AgentForge().register(plugin);

    originalMetadata.name = "mutated";
    originalMetadata.version = "9.9.9";
    originalMetadata.description = "Mutated description";
    (plugin as { metadata: PluginMetadata }).metadata = {
      name: "replacement",
      version: "2.0.0",
    };

    const metadata = agent.getPluginMetadata("original");
    expect(metadata).toEqual({
      name: "original",
      version: "1.0.0",
      description: "Original description",
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(agent.hasPlugin("mutated")).toBe(false);
    expect(agent.hasPlugin("replacement")).toBe(false);
  });

  it("remains available through successful lifecycle states", async () => {
    const expected = [{ name: "example", version: "1.0.0" }];
    const agent = new AgentForge();
    const plugin = createPlugin("example", "1.0.0", undefined, {
      initialize: () => {
        expect(agent.getState()).toBe(AgentForgeState.Starting);
        expectRegistry(agent, expected);
      },
      shutdown: () => {
        expect(agent.getState()).toBe(AgentForgeState.Stopping);
        expectRegistry(agent, expected);
      },
    });
    agent.register(plugin);

    expect(agent.getState()).toBe(AgentForgeState.Created);
    expectRegistry(agent, expected);
    await agent.start();
    expect(agent.getState()).toBe(AgentForgeState.Running);
    expectRegistry(agent, expected);
    await agent.stop();
    expect(agent.getState()).toBe(AgentForgeState.Stopped);
    expectRegistry(agent, expected);
  });

  it("remains stable after failed initialization and rollback", async () => {
    const expected = [
      { name: "first", version: "1.0.0" },
      { name: "broken", version: "1.0.0" },
    ];
    const agent = new AgentForge().register(createPlugin("first")).register(
      createPlugin("broken", "1.0.0", undefined, {
        initialize: () => {
          throw new Error("initialization failed");
        },
      }),
    );

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );
    expect(agent.getState()).toBe(AgentForgeState.Failed);
    expectRegistry(agent, expected);
  });

  it("remains stable after failed shutdown", async () => {
    const expected = [{ name: "broken", version: "1.0.0" }];
    const agent = new AgentForge().register(
      createPlugin("broken", "1.0.0", undefined, {
        shutdown: () => {
          throw new Error("shutdown failed");
        },
      }),
    );

    await agent.start();
    await expect(agent.stop()).rejects.toBeInstanceOf(PluginShutdownError);
    expect(agent.getState()).toBe(AgentForgeState.Failed);
    expectRegistry(agent, expected);
  });

  it("does not modify the registry when duplicate registration is rejected", () => {
    const agent = new AgentForge().register(
      createPlugin("duplicate", "1.0.0", "Original plugin"),
    );

    expect(() =>
      agent.register(createPlugin("duplicate", "2.0.0", "Rejected plugin")),
    ).toThrow(DuplicatePluginError);

    expect(agent.getPluginCount()).toBe(1);
    expect(agent.getPluginMetadata("duplicate")).toEqual({
      name: "duplicate",
      version: "1.0.0",
      description: "Original plugin",
    });
    expect(agent.getRegisteredPlugins()).toEqual([
      {
        name: "duplicate",
        version: "1.0.0",
        description: "Original plugin",
      },
    ]);
  });
});
