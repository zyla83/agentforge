import {
  AGENTFORGE_VERSION,
  AgentForge,
  AgentForgeState,
} from "@agentforge/core";
import type { LogContext, LogLevel, Logger } from "@agentforge/logger";
import type {
  Plugin,
  PluginContext,
  PluginMetadata,
} from "@agentforge/plugin-sdk";
import {
  DuplicatePluginError,
  InvalidConfigurationError,
  InvalidLifecycleOperationError,
  InvalidPluginDescriptionError,
  InvalidPluginNameError,
  InvalidPluginVersionError,
  PluginInitializationError,
  PluginShutdownError,
} from "@agentforge/shared";
import { describe, expect, it } from "vitest";

interface PluginHooks {
  initialize?(context: PluginContext): Promise<void> | void;
  shutdown?(): Promise<void> | void;
}

interface RecordedLog {
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: LogContext;
  readonly bindings: LogContext;
}

class RecordingLogger implements Logger {
  readonly records: RecordedLog[];
  readonly children: RecordingLogger[];
  readonly childBindings: LogContext[];
  readonly bindings: LogContext;

  constructor(
    records: RecordedLog[] = [],
    bindings: LogContext = {},
    children: RecordingLogger[] = [],
    childBindings: LogContext[] = [],
  ) {
    this.records = records;
    this.bindings = bindings;
    this.children = children;
    this.childBindings = childBindings;
  }

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

  child(bindings: LogContext): Logger {
    this.childBindings.push(bindings);
    const child = new RecordingLogger(
      this.records,
      { ...this.bindings, ...bindings },
      this.children,
      this.childBindings,
    );
    this.children.push(child);

    return child;
  }

  private record(level: LogLevel, message: string, context?: LogContext): void {
    const record = {
      level,
      message,
      bindings: this.bindings,
    };

    this.records.push(context ? { ...record, context } : record);
  }
}

function createPlugin(
  name: string,
  hooks: PluginHooks = {},
  metadata: Omit<PluginMetadata, "name"> = { version: "1.0.0" },
): Plugin {
  const plugin: Plugin = {
    metadata: { name, ...metadata },
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

function asPlugin(value: unknown): Plugin {
  return value as Plugin;
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

describe("AgentForge logging", () => {
  it("accepts a custom logger", () => {
    const logger = new RecordingLogger();

    expect(() => new AgentForge(undefined, { logger })).not.toThrow();
    expect(logger.children).toHaveLength(1);
  });

  it("creates a child logger with framework bindings", () => {
    const logger = new RecordingLogger();

    new AgentForge({ instanceName: "desktop-assistant" }, { logger });

    expect(logger.childBindings[0]).toEqual({
      component: "agentforge",
      instanceName: "desktop-assistant",
    });
  });

  it("provides a logger to every plugin", async () => {
    const logger = new RecordingLogger();
    const receivedLoggers: Logger[] = [];
    const agent = new AgentForge(undefined, { logger })
      .register(
        createPlugin("first", {
          initialize: (context) => receivedLoggers.push(context.logger),
        }),
      )
      .register(
        createPlugin("second", {
          initialize: (context) => receivedLoggers.push(context.logger),
        }),
      );

    await agent.start();

    expect(receivedLoggers).toHaveLength(2);
    expect(receivedLoggers.every(Boolean)).toBe(true);
  });

  it("provides separate child loggers to plugins", async () => {
    const logger = new RecordingLogger();
    const receivedLoggers: Logger[] = [];
    const agent = new AgentForge(undefined, { logger })
      .register(
        createPlugin("first", {
          initialize: (context) => receivedLoggers.push(context.logger),
        }),
      )
      .register(
        createPlugin("second", {
          initialize: (context) => receivedLoggers.push(context.logger),
        }),
      );

    await agent.start();

    expect(receivedLoggers[0]).not.toBe(receivedLoggers[1]);
    expect(logger.childBindings).toContainEqual({
      component: "plugin",
      pluginName: "first",
      pluginVersion: "1.0.0",
    });
    expect(logger.childBindings).toContainEqual({
      component: "plugin",
      pluginName: "second",
      pluginVersion: "1.0.0",
    });
  });

  it("emits framework and plugin lifecycle messages", async () => {
    const logger = new RecordingLogger();
    const agent = new AgentForge(undefined, { logger }).register(
      createPlugin("example", { shutdown: () => undefined }),
    );

    await agent.start();
    await agent.stop();

    expect(logger.records.map((record) => record.message)).toEqual([
      "AgentForge is starting",
      "Plugin is initializing",
      "Plugin initialized",
      "AgentForge started",
      "AgentForge is stopping",
      "Plugin is shutting down",
      "Plugin shut down",
      "AgentForge stopped",
    ]);
    expect(logger.records[0]).toMatchObject({
      level: "info",
      context: { pluginCount: 1 },
    });
  });

  it("logs plugin initialization failures", async () => {
    const logger = new RecordingLogger();
    const failure = new Error("initialization failed");
    const agent = new AgentForge(undefined, { logger }).register(
      createPlugin("broken", {
        initialize: () => {
          throw failure;
        },
      }),
    );

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );

    expect(logger.records).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "Plugin initialization failed",
        context: { error: failure },
      }),
    );
  });

  it("logs rollback shutdown failures", async () => {
    const logger = new RecordingLogger();
    const rollbackFailure = new Error("rollback failed");
    const agent = new AgentForge(undefined, { logger })
      .register(
        createPlugin("first", {
          shutdown: () => {
            throw rollbackFailure;
          },
        }),
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

    expect(logger.records).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: "Plugin rollback shutdown failed",
        context: { error: rollbackFailure },
      }),
    );
  });

  it("logs plugin shutdown failures", async () => {
    const logger = new RecordingLogger();
    const shutdownFailure = new Error("shutdown failed");
    const agent = new AgentForge(undefined, { logger }).register(
      createPlugin("broken", {
        shutdown: () => {
          throw shutdownFailure;
        },
      }),
    );
    await agent.start();

    await expect(agent.stop()).rejects.toBeInstanceOf(PluginShutdownError);

    expect(logger.records).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "Plugin shutdown failed",
        context: { error: shutdownFailure },
      }),
    );
  });

  it("does not change successful lifecycle behavior", async () => {
    const logger = new RecordingLogger();
    const agent = new AgentForge(undefined, { logger });

    await agent.start();
    expect(agent.getState()).toBe(AgentForgeState.Running);

    await agent.stop();
    expect(agent.getState()).toBe(AgentForgeState.Stopped);
  });

  it("never includes plugin configuration in logging data", async () => {
    const logger = new RecordingLogger();
    const agent = new AgentForge(
      {
        plugins: {
          example: { secret: "classified-value" },
        },
      },
      { logger },
    ).register(createPlugin("example", { shutdown: () => undefined }));

    await agent.start();
    await agent.stop();

    expect(JSON.stringify(logger.records)).not.toContain("classified-value");
  });
});

describe("AgentForge plugin metadata", () => {
  it("registers valid metadata", () => {
    const agent = new AgentForge();

    agent.register(createPlugin("example"));

    expect(agent.getPluginCount()).toBe(1);
  });

  it("accepts an omitted description", () => {
    expect(() =>
      new AgentForge().register(
        createPlugin("example", {}, { version: "1.0.0" }),
      ),
    ).not.toThrow();
  });

  it("accepts a non-empty description", () => {
    expect(() =>
      new AgentForge().register(
        createPlugin(
          "example",
          {},
          { version: "1.0.0", description: "Example plugin" },
        ),
      ),
    ).not.toThrow();
  });

  it.each(["2.1.3-alpha.1", "2.1.3+build.42", "2.1.3-beta.1+build.42"])(
    "accepts semantic version %s",
    (version) => {
      expect(() =>
        new AgentForge().register(createPlugin("example", {}, { version })),
      ).not.toThrow();
    },
  );

  it("rejects missing metadata", () => {
    expect(() => new AgentForge().register(asPlugin({}))).toThrow(
      InvalidPluginNameError,
    );
  });

  it("rejects metadata that is not an object", () => {
    expect(() =>
      new AgentForge().register(asPlugin({ metadata: "example" })),
    ).toThrow(InvalidPluginNameError);
  });

  it("rejects a missing metadata name", () => {
    expect(() =>
      new AgentForge().register(asPlugin({ metadata: { version: "1.0.0" } })),
    ).toThrow(InvalidPluginNameError);
  });

  it("rejects a non-string metadata name", () => {
    expect(() =>
      new AgentForge().register(
        asPlugin({ metadata: { name: 42, version: "1.0.0" } }),
      ),
    ).toThrow(InvalidPluginNameError);
  });

  it("rejects a missing metadata version", () => {
    expect(() =>
      new AgentForge().register(asPlugin({ metadata: { name: "example" } })),
    ).toThrow(InvalidPluginVersionError);
  });

  it("rejects a non-string metadata version", () => {
    expect(() =>
      new AgentForge().register(
        asPlugin({ metadata: { name: "example", version: 1 } }),
      ),
    ).toThrow(InvalidPluginVersionError);
  });

  it.each([
    "",
    "latest",
    "v1.0.0",
    "1.0.0.0",
    "01.0.0",
    "1.0",
    "1.0.0-alpha beta",
    "1.0.0+build 42",
    "1.0.0-alpha_beta",
  ])("rejects invalid semantic version %s", (version) => {
    expect(() =>
      new AgentForge().register(createPlugin("example", {}, { version })),
    ).toThrow(InvalidPluginVersionError);
  });

  it("exposes invalid version details", () => {
    const pluginVersion = { channel: "latest" };
    const error = (() => {
      try {
        new AgentForge().register(
          asPlugin({
            metadata: { name: "example", version: pluginVersion },
          }),
        );
      } catch (caughtError) {
        return caughtError;
      }

      throw new Error("Expected registration to throw.");
    })();

    expect(error).toMatchObject({
      pluginName: "example",
      pluginVersion,
    });
  });

  it("rejects a non-string description", () => {
    expect(() =>
      new AgentForge().register(
        asPlugin({
          metadata: { name: "example", version: "1.0.0", description: 42 },
        }),
      ),
    ).toThrow(InvalidPluginDescriptionError);
  });

  it.each(["", "  \t"])("rejects invalid description %j", (description) => {
    expect(() =>
      new AgentForge().register(
        createPlugin("example", {}, { version: "1.0.0", description }),
      ),
    ).toThrow(InvalidPluginDescriptionError);
  });

  it("uses a metadata snapshot for configuration and logger bindings", async () => {
    const metadata = {
      name: "original",
      version: "1.0.0",
      description: "Original description",
    };
    let receivedConfiguration: unknown;
    const plugin: Plugin = {
      metadata,
      async initialize(context) {
        receivedConfiguration = context.configuration;
      },
    };
    const logger = new RecordingLogger();
    const agent = new AgentForge(
      { plugins: { original: { enabled: true } } },
      { logger },
    ).register(plugin);

    metadata.name = "mutated";
    metadata.version = "9.9.9";
    metadata.description = "Mutated description";
    await agent.start();

    expect(receivedConfiguration).toEqual({ enabled: true });
    expect(logger.childBindings).toContainEqual({
      component: "plugin",
      pluginName: "original",
      pluginVersion: "1.0.0",
    });
  });

  it("ignores replacement of the plugin metadata object", async () => {
    const plugin = createPlugin("original");
    let receivedConfiguration: unknown;
    plugin.initialize = async (context) => {
      receivedConfiguration = context.configuration;
    };
    const agent = new AgentForge({
      plugins: { original: { enabled: true } },
    }).register(plugin);

    (plugin as { metadata: PluginMetadata }).metadata = {
      name: "replacement",
      version: "9.9.9",
    };
    await agent.start();

    expect(receivedConfiguration).toEqual({ enabled: true });
  });

  it("uses the snapshot name in initialization errors", async () => {
    const metadata = { name: "original", version: "1.0.0" };
    const plugin: Plugin = {
      metadata,
      async initialize() {
        throw new Error("initialization failed");
      },
    };
    const agent = new AgentForge().register(plugin);
    metadata.name = "mutated";

    const error = await captureError(() => agent.start());

    expect(error).toMatchObject({ pluginName: "original" });
  });

  it("uses the snapshot name in shutdown failures", async () => {
    const metadata = { name: "original", version: "1.0.0" };
    const plugin: Plugin = {
      metadata,
      async initialize() {},
      async shutdown() {
        throw new Error("shutdown failed");
      },
    };
    const agent = new AgentForge().register(plugin);
    metadata.name = "mutated";
    await agent.start();

    const error = await captureError(() => agent.stop());

    expect(error).toMatchObject({
      failures: [expect.objectContaining({ pluginName: "original" })],
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
