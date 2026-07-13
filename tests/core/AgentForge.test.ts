import {
  AGENTFORGE_VERSION,
  AgentForge,
  AgentForgeState,
} from "@agentforge/core";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";
import {
  DuplicatePluginError,
  InvalidConfigurationError,
  InvalidLifecycleOperationError,
  InvalidPluginNameError,
  PluginInitializationError,
  PluginShutdownError,
} from "@agentforge/shared";
import { describe, expect, it } from "vitest";

interface PluginHooks {
  initialize?(context: PluginContext): Promise<void> | void;
  shutdown?(): Promise<void> | void;
}

function createPlugin(name: string, hooks: PluginHooks = {}): Plugin {
  const plugin: Plugin = {
    name,
    async initialize(context) {
      await hooks.initialize?.(context);
    },
  };
  const shutdown = hooks.shutdown;

  if (!shutdown) {
    return plugin;
  }

  return {
    ...plugin,
    async shutdown() {
      await shutdown();
    },
  };
}

async function captureError(action: () => Promise<void>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected the action to reject.");
}

describe("AgentForge configuration", () => {
  it("uses the default configuration", () => {
    const agent = new AgentForge();

    expect(agent.getConfig()).toEqual({
      instanceName: "default",
      plugins: {},
    });
  });

  it("exposes validated configuration", () => {
    const agent = new AgentForge({
      instanceName: "  desktop-assistant  ",
      plugins: { example: { enabled: true } },
    });

    expect(agent.getConfig()).toEqual({
      instanceName: "desktop-assistant",
      plugins: { example: { enabled: true } },
    });
  });

  it("rejects invalid configuration during construction", () => {
    expect(() => new AgentForge({ instanceName: "" })).toThrow(
      InvalidConfigurationError,
    );
  });

  it("passes the configured instance name to plugins", async () => {
    let instanceName: string | undefined;
    const agent = new AgentForge({
      instanceName: "desktop-assistant",
    }).register(
      createPlugin("example", {
        initialize: (context) => {
          instanceName = context.instanceName;
        },
      }),
    );

    await agent.start();

    expect(instanceName).toBe("desktop-assistant");
  });

  it("passes only the plugin's own configuration", async () => {
    let receivedConfiguration: unknown;
    const databaseConfiguration = { connectionString: "local" };
    const agent = new AgentForge({
      plugins: {
        database: databaseConfiguration,
        assistant: { language: "pl" },
      },
    }).register(
      createPlugin("database", {
        initialize: (context) => {
          receivedConfiguration = context.configuration;
        },
      }),
    );

    await agent.start();

    expect(receivedConfiguration).toEqual(databaseConfiguration);
  });

  it("passes undefined to a plugin without configuration", async () => {
    let receivedConfiguration: unknown = "not initialized";
    const agent = new AgentForge().register(
      createPlugin("example", {
        initialize: (context) => {
          receivedConfiguration = context.configuration;
        },
      }),
    );

    await agent.start();

    expect(receivedConfiguration).toBeUndefined();
  });

  it("passes different configuration values to different plugins", async () => {
    const receivedConfigurations = new Map<string, unknown>();
    const agent = new AgentForge({
      plugins: {
        database: { storage: "memory" },
        assistant: { language: "en" },
      },
    })
      .register(
        createPlugin("database", {
          initialize: (context) => {
            receivedConfigurations.set("database", context.configuration);
          },
        }),
      )
      .register(
        createPlugin("assistant", {
          initialize: (context) => {
            receivedConfigurations.set("assistant", context.configuration);
          },
        }),
      );

    await agent.start();

    expect(receivedConfigurations.get("database")).toEqual({
      storage: "memory",
    });
    expect(receivedConfigurations.get("assistant")).toEqual({
      language: "en",
    });
  });
});

describe("AgentForge registration", () => {
  it("starts with zero plugins", () => {
    const agent = new AgentForge();

    expect(agent.getPluginCount()).toBe(0);
  });

  it("registers a plugin", () => {
    const agent = new AgentForge();

    agent.register(createPlugin("first"));

    expect(agent.getPluginCount()).toBe(1);
  });

  it("supports chained registration", () => {
    const agent = new AgentForge();

    const result = agent
      .register(createPlugin("first"))
      .register(createPlugin("second"));

    expect(result).toBe(agent);
    expect(agent.getPluginCount()).toBe(2);
  });

  it("rejects duplicate names", () => {
    const agent = new AgentForge();
    agent.register(createPlugin("duplicate"));

    expect(() => agent.register(createPlugin("duplicate"))).toThrow(
      DuplicatePluginError,
    );
  });

  it("compares plugin names case-sensitively", () => {
    const agent = new AgentForge();

    agent.register(createPlugin("example")).register(createPlugin("Example"));

    expect(agent.getPluginCount()).toBe(2);
  });

  it("rejects an empty name", () => {
    const agent = new AgentForge();

    expect(() => agent.register(createPlugin(""))).toThrow(
      InvalidPluginNameError,
    );
  });

  it("rejects a whitespace-only name", () => {
    const agent = new AgentForge();

    expect(() => agent.register(createPlugin("  \t"))).toThrow(
      InvalidPluginNameError,
    );
  });

  it("rejects registration after the framework starts", async () => {
    const agent = new AgentForge();
    await agent.start();

    expect(() => agent.register(createPlugin("late"))).toThrow(
      InvalidLifecycleOperationError,
    );
  });

  it("does not alter the registry when rejecting a duplicate", () => {
    const agent = new AgentForge();
    agent.register(createPlugin("duplicate"));

    expect(() => agent.register(createPlugin("duplicate"))).toThrow();
    expect(agent.getPluginCount()).toBe(1);
  });
});

describe("AgentForge start lifecycle", () => {
  it("exposes the framework runtime version", () => {
    expect(AGENTFORGE_VERSION).toBe("0.1.0");
  });

  it("starts without plugins", async () => {
    const agent = new AgentForge();

    await expect(agent.start()).resolves.toBeUndefined();
  });

  it("initializes plugins in registration order", async () => {
    const calls: string[] = [];
    const agent = new AgentForge()
      .register(
        createPlugin("first", {
          initialize: () => calls.push("first"),
        }),
      )
      .register(
        createPlugin("second", {
          initialize: () => calls.push("second"),
        }),
      );

    await agent.start();

    expect(calls).toEqual(["first", "second"]);
  });

  it("supplies the expected plugin context", async () => {
    let receivedContext: PluginContext | undefined;
    const agent = new AgentForge().register(
      createPlugin("context", {
        initialize: (context) => {
          receivedContext = context;
        },
      }),
    );

    await agent.start();

    expect(receivedContext?.frameworkVersion).toBe(AGENTFORGE_VERSION);
  });

  it("transitions to Running", async () => {
    const agent = new AgentForge();

    await agent.start();

    expect(agent.getState()).toBe(AgentForgeState.Running);
  });

  it("rejects a second start call", async () => {
    const agent = new AgentForge();
    await agent.start();

    await expect(agent.start()).rejects.toBeInstanceOf(
      InvalidLifecycleOperationError,
    );
  });

  it("rejects stop before start", async () => {
    const agent = new AgentForge();

    await expect(agent.stop()).rejects.toBeInstanceOf(
      InvalidLifecycleOperationError,
    );
  });
});

describe("AgentForge stop lifecycle", () => {
  it("shuts down plugins in reverse registration order", async () => {
    const calls: string[] = [];
    const agent = new AgentForge()
      .register(createPlugin("first", { shutdown: () => calls.push("first") }))
      .register(
        createPlugin("second", { shutdown: () => calls.push("second") }),
      );
    await agent.start();

    await agent.stop();

    expect(calls).toEqual(["second", "first"]);
  });

  it("ignores plugins without shutdown handlers", async () => {
    const calls: string[] = [];
    const agent = new AgentForge()
      .register(
        createPlugin("with-shutdown", {
          shutdown: () => calls.push("with-shutdown"),
        }),
      )
      .register(createPlugin("without-shutdown"));
    await agent.start();

    await expect(agent.stop()).resolves.toBeUndefined();
    expect(calls).toEqual(["with-shutdown"]);
  });

  it("transitions to Stopped", async () => {
    const agent = new AgentForge();
    await agent.start();

    await agent.stop();

    expect(agent.getState()).toBe(AgentForgeState.Stopped);
  });

  it("rejects a second stop call", async () => {
    const agent = new AgentForge();
    await agent.start();
    await agent.stop();

    await expect(agent.stop()).rejects.toBeInstanceOf(
      InvalidLifecycleOperationError,
    );
  });

  it("rejects start after the framework has stopped", async () => {
    const agent = new AgentForge();
    await agent.start();
    await agent.stop();

    await expect(agent.start()).rejects.toBeInstanceOf(
      InvalidLifecycleOperationError,
    );
  });
});

describe("AgentForge initialization failure", () => {
  it("reports the failing plugin name", async () => {
    const agent = new AgentForge().register(
      createPlugin("broken", {
        initialize: () => {
          throw new Error("initialization failed");
        },
      }),
    );

    const error = await captureError(() => agent.start());

    expect(error).toBeInstanceOf(PluginInitializationError);
    expect(error).toMatchObject({ pluginName: "broken" });
  });

  it("preserves the original error as cause", async () => {
    const cause = new Error("initialization failed");
    const agent = new AgentForge().register(
      createPlugin("broken", {
        initialize: () => {
          throw cause;
        },
      }),
    );

    const error = await captureError(() => agent.start());

    expect(error).toMatchObject({ cause });
  });

  it("shuts down previously initialized plugins in reverse order", async () => {
    const calls: string[] = [];
    const agent = new AgentForge()
      .register(createPlugin("first", { shutdown: () => calls.push("first") }))
      .register(
        createPlugin("second", { shutdown: () => calls.push("second") }),
      )
      .register(
        createPlugin("broken", {
          initialize: () => {
            throw new Error("initialization failed");
          },
        }),
      );

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );
    expect(calls).toEqual(["second", "first"]);
  });

  it("does not shut down plugins that were not initialized", async () => {
    const calls: string[] = [];
    const agent = new AgentForge()
      .register(
        createPlugin("broken", {
          initialize: () => {
            throw new Error("initialization failed");
          },
          shutdown: () => calls.push("broken"),
        }),
      )
      .register(createPlugin("later", { shutdown: () => calls.push("later") }));

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );
    expect(calls).toEqual([]);
  });

  it("continues rollback when a shutdown handler fails", async () => {
    const calls: string[] = [];
    const agent = new AgentForge()
      .register(
        createPlugin("first", {
          shutdown: () => {
            calls.push("first");
            throw new Error("rollback failed");
          },
        }),
      )
      .register(
        createPlugin("second", { shutdown: () => calls.push("second") }),
      )
      .register(
        createPlugin("broken", {
          initialize: () => {
            throw new Error("initialization failed");
          },
        }),
      );

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );
    expect(calls).toEqual(["second", "first"]);
  });

  it("ends in the Failed state", async () => {
    const agent = new AgentForge().register(
      createPlugin("broken", {
        initialize: () => {
          throw new Error("initialization failed");
        },
      }),
    );

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );
    expect(agent.getState()).toBe(AgentForgeState.Failed);
  });
});

describe("AgentForge shutdown failure", () => {
  it("attempts every shutdown and exposes all failures", async () => {
    const calls: string[] = [];
    const firstError = new Error("first failed");
    const secondError = new Error("second failed");
    const agent = new AgentForge()
      .register(
        createPlugin("first", {
          shutdown: () => {
            calls.push("first");
            throw firstError;
          },
        }),
      )
      .register(
        createPlugin("second", {
          shutdown: () => {
            calls.push("second");
            throw secondError;
          },
        }),
      )
      .register(createPlugin("third", { shutdown: () => calls.push("third") }));
    await agent.start();

    const error = await captureError(() => agent.stop());

    expect(calls).toEqual(["third", "second", "first"]);
    expect(error).toBeInstanceOf(PluginShutdownError);
    expect(error).toMatchObject({
      failures: [
        { pluginName: "second", error: secondError },
        { pluginName: "first", error: firstError },
      ],
    });
  });

  it("ends in the Failed state", async () => {
    const agent = new AgentForge().register(
      createPlugin("broken", {
        shutdown: () => {
          throw new Error("shutdown failed");
        },
      }),
    );
    await agent.start();

    await expect(agent.stop()).rejects.toBeInstanceOf(PluginShutdownError);
    expect(agent.getState()).toBe(AgentForgeState.Failed);
  });
});
