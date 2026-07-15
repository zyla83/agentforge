import { AgentForge, AgentForgeState } from "@agentforge/core";
import type { LogContext, LogLevel, Logger } from "@agentforge/logger";
import type { Plugin, PluginContext } from "@agentforge/plugin-sdk";
import {
  DuplicateProviderError,
  InvalidProviderMetadataError,
  LLMFinishReason,
  LLMMessageRole,
  ProviderError,
  ProviderNotFoundError,
  healthyProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
  LLMProviderRegistry,
  ProviderMetadata,
} from "@agentforge/provider-sdk";
import {
  InvalidLifecycleOperationError,
  PluginInitializationError,
  PluginShutdownError,
} from "@agentforge/shared";
import { describe, expect, it } from "vitest";

interface RecordedLog {
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: LogContext;
  readonly bindings: LogContext;
}

class RecordingLogger implements Logger {
  readonly records: RecordedLog[];
  readonly bindings: LogContext;

  constructor(records: RecordedLog[] = [], bindings: LogContext = {}) {
    this.records = records;
    this.bindings = bindings;
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
    return new RecordingLogger(this.records, {
      ...this.bindings,
      ...bindings,
    });
  }

  private record(level: LogLevel, message: string, context?: LogContext): void {
    const record = { level, message, bindings: this.bindings };
    this.records.push(context ? { ...record, context } : record);
  }
}

function createProvider(
  name: string,
  version = "1.0.0",
  description?: string,
  checkHealth = async () => healthyProvider(),
): LLMProvider {
  const metadata: ProviderMetadata = description
    ? { name, version, description }
    : { name, version };

  return {
    metadata,
    checkHealth,
    async generate(
      request: LLMGenerationRequest,
    ): Promise<LLMGenerationResponse> {
      return {
        model: request.model,
        message: {
          role: LLMMessageRole.Assistant,
          content: "Example response",
        },
        finishReason: LLMFinishReason.Stop,
      };
    },
  };
}

function createPlugin(
  name: string,
  initialize: (context: PluginContext) => Promise<void> | void,
  shutdown?: () => Promise<void> | void,
): Plugin {
  return {
    metadata: { name, version: "1.0.0" },
    async initialize(context) {
      await initialize(context);
    },
    ...(shutdown
      ? {
          async shutdown() {
            await shutdown();
          },
        }
      : {}),
  };
}

function asProvider(value: unknown): LLMProvider {
  return value as LLMProvider;
}

function captureMetadataError(
  action: () => void,
): InvalidProviderMetadataError {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidProviderMetadataError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected provider metadata validation to throw.");
}

function expectRegistry(
  agent: AgentForge,
  expectedNames: readonly string[],
): void {
  expect(agent.getRegisteredLLMProviders().map(({ name }) => name)).toEqual(
    expectedNames,
  );

  for (const name of expectedNames) {
    expect(agent.hasLLMProvider(name)).toBe(true);
    expect(agent.getLLMProvider(name)).toBeDefined();
  }
}

describe("AgentForge LLM provider registry", () => {
  it("exposes an empty frozen registry without an implicit default", () => {
    const agent = new AgentForge();
    const providers = agent.getRegisteredLLMProviders();

    expect(providers).toEqual([]);
    expect(Object.isFrozen(providers)).toBe(true);
    expect(agent.hasLLMProvider("unknown")).toBe(false);
    expect(agent.getLLMProvider("unknown")).toBeUndefined();
    expect(agent.getDefaultLLMProvider()).toBeUndefined();
  });

  it("supports chained registration and preserves registration order", () => {
    const first = createProvider("first");
    const second = createProvider("second");
    const agent = new AgentForge();

    const result = agent.registerLLMProvider(first).registerLLMProvider(second);

    expect(result).toBe(agent);
    expect(agent.getLLMProvider("first")).toBe(first);
    expect(agent.getLLMProvider("second")).toBe(second);
    expectRegistry(agent, ["first", "second"]);
  });

  it("uses exact case-sensitive names without trimming lookups", () => {
    const spaced = createProvider(" spaced ");
    const agent = new AgentForge()
      .registerLLMProvider(createProvider("example"))
      .registerLLMProvider(createProvider("Example"))
      .registerLLMProvider(spaced);

    expect(agent.getLLMProvider("example")).toBeDefined();
    expect(agent.getLLMProvider("Example")).toBeDefined();
    expect(agent.getLLMProvider(" spaced ")).toBe(spaced);
    expect(agent.getLLMProvider("spaced")).toBeUndefined();
  });

  it("handles malformed runtime lookup values safely", () => {
    const agent = new AgentForge().registerLLMProvider(
      createProvider("example"),
    );
    const invalidName = 42 as unknown as string;

    expect(agent.hasLLMProvider(invalidName)).toBe(false);
    expect(agent.getLLMProvider(invalidName)).toBeUndefined();
  });

  it("rejects duplicates without changing the registry", () => {
    const original = createProvider("duplicate", "1.0.0");
    const agent = new AgentForge().registerLLMProvider(original);

    expect(() =>
      agent.registerLLMProvider(createProvider("duplicate", "2.0.0")),
    ).toThrow(DuplicateProviderError);
    expect(agent.getLLMProvider("duplicate")).toBe(original);
    expect(agent.getRegisteredLLMProviders()).toEqual([
      { name: "duplicate", version: "1.0.0" },
    ]);
  });

  it("returns a new frozen metadata list that cannot alter the registry", () => {
    const agent = new AgentForge()
      .registerLLMProvider(createProvider("first"))
      .registerLLMProvider(createProvider("second"));
    const firstList = agent.getRegisteredLLMProviders();
    const secondList = agent.getRegisteredLLMProviders();

    expect(firstList).not.toBe(secondList);
    expect(Object.isFrozen(firstList)).toBe(true);
    expect(firstList.every(Object.isFrozen)).toBe(true);
    expect(() =>
      (firstList as ProviderMetadata[]).push({
        name: "injected",
        version: "1.0.0",
      }),
    ).toThrow(TypeError);
    expectRegistry(agent, ["first", "second"]);
  });
});

describe("LLM provider metadata validation", () => {
  it.each([
    ["stable", "1.0.0", undefined],
    ["described", "1.0.0", "Described provider"],
    ["prerelease", "2.0.0-alpha.1", undefined],
    ["build", "2.0.0+build.42", undefined],
  ])("accepts valid metadata for %s", (name, version, description) => {
    expect(() =>
      new AgentForge().registerLLMProvider(
        createProvider(name, version, description),
      ),
    ).not.toThrow();
  });

  it.each([
    [undefined, "provider: must be an object"],
    [null, "provider: must be an object"],
    [42, "provider: must be an object"],
    [{}, "metadata: must be an object"],
    [{ metadata: null }, "metadata: must be an object"],
    [{ metadata: "provider" }, "metadata: must be an object"],
  ])("rejects malformed provider value %j", (provider, detail) => {
    const error = captureMetadataError(() =>
      new AgentForge().registerLLMProvider(asProvider(provider)),
    );

    expect(error.details).toEqual([detail]);
    expect(error.providerName).toBe("<unknown>");
  });

  it.each([
    [{ version: "1.0.0" }, "name: must be a non-empty string"],
    [{ name: "", version: "1.0.0" }, "name: must be a non-empty string"],
    [{ name: "  ", version: "1.0.0" }, "name: must be a non-empty string"],
    [{ name: 42, version: "1.0.0" }, "name: must be a non-empty string"],
    [{ name: "example" }, "version: must be a valid semantic version"],
    [
      { name: "example", version: "latest" },
      "version: must be a valid semantic version",
    ],
    [
      { name: "example", version: "1.0.0", description: "" },
      "description: must be a non-empty string",
    ],
    [
      { name: "example", version: "1.0.0", description: "  " },
      "description: must be a non-empty string",
    ],
    [
      { name: "example", version: "1.0.0", description: 42 },
      "description: must be a non-empty string",
    ],
  ])("rejects invalid metadata %j", (metadata, detail) => {
    const error = captureMetadataError(() =>
      new AgentForge().registerLLMProvider(asProvider({ metadata })),
    );

    expect(error.details).toContain(detail);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error).toBeInstanceOf(ProviderError);
  });

  it("copies error details and preserves causes", () => {
    const details = ["version: must be a valid semantic version"];
    const cause = new Error("metadata cause");
    const error = new InvalidProviderMetadataError("example", details, {
      cause,
    });
    details.push("mutated");

    expect(error.details).toEqual([
      "version: must be a valid semantic version",
    ]);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'Provider "example" metadata is invalid: version: must be a valid semantic version.',
    );
  });

  it("reports metadata details in deterministic order", () => {
    const error = captureMetadataError(() =>
      new AgentForge().registerLLMProvider(
        asProvider({
          metadata: { name: " ", version: "latest", description: "" },
        }),
      ),
    );

    expect(error.details).toEqual([
      "name: must be a non-empty string",
      "version: must be a valid semantic version",
      "description: must be a non-empty string",
    ]);
  });
});

describe("AgentForge default LLM provider", () => {
  it("does not select the first provider implicitly", () => {
    const agent = new AgentForge().registerLLMProvider(createProvider("first"));

    expect(agent.getDefaultLLMProvider()).toBeUndefined();
  });

  it("selects and replaces defaults during registration", () => {
    const first = createProvider("first");
    const second = createProvider("second");
    const agent = new AgentForge()
      .registerLLMProvider(first, { default: true })
      .registerLLMProvider(second, { default: true });

    expect(agent.getDefaultLLMProvider()).toBe(second);
  });

  it("selects an existing provider and permits repeated selection", () => {
    const first = createProvider("first");
    const second = createProvider("second");
    const agent = new AgentForge()
      .registerLLMProvider(first)
      .registerLLMProvider(second, { default: true });

    expect(agent.setDefaultLLMProvider("first")).toBe(agent);
    expect(agent.setDefaultLLMProvider("first")).toBe(agent);
    expect(agent.getDefaultLLMProvider()).toBe(first);
  });

  it("rejects unknown exact names without changing the current default", () => {
    const provider = createProvider("example");
    const agent = new AgentForge().registerLLMProvider(provider, {
      default: true,
    });

    expect(() => agent.setDefaultLLMProvider("Example")).toThrow(
      ProviderNotFoundError,
    );
    expect(() => agent.setDefaultLLMProvider(" example ")).toThrow(
      ProviderNotFoundError,
    );
    expect(agent.getDefaultLLMProvider()).toBe(provider);
  });
});

describe("LLM provider metadata snapshots", () => {
  it("uses snapshots for lookup, listing, defaults, and logs", async () => {
    const metadata = {
      name: "original",
      version: "1.0.0",
      description: "Original provider",
    };
    const provider = createProvider(
      metadata.name,
      metadata.version,
      metadata.description,
    );
    (provider as { metadata: ProviderMetadata }).metadata = metadata;
    const logger = new RecordingLogger();
    let registry: LLMProviderRegistry | undefined;
    const agent = new AgentForge(undefined, { logger })
      .registerLLMProvider(provider)
      .register(
        createPlugin("inspector", (context) => {
          registry = context.llmProviders;
        }),
      );

    metadata.name = "mutated";
    metadata.version = "9.9.9";
    metadata.description = "Mutated provider";
    (provider as { metadata: ProviderMetadata }).metadata = {
      name: "replacement",
      version: "2.0.0",
    };
    agent.setDefaultLLMProvider("original");
    await agent.start();

    expect(agent.getLLMProvider("original")).toBe(provider);
    expect(agent.getLLMProvider("mutated")).toBeUndefined();
    expect(agent.getRegisteredLLMProviders()).toEqual([
      {
        name: "original",
        version: "1.0.0",
        description: "Original provider",
      },
    ]);
    expect(registry?.getDefaultMetadata()).toEqual({
      name: "original",
      version: "1.0.0",
      description: "Original provider",
    });
    expect(Object.isFrozen(registry?.getDefaultMetadata())).toBe(true);
    expect(logger.records).toContainEqual(
      expect.objectContaining({
        message: "LLM provider registered",
        context: {
          providerName: "original",
          providerVersion: "1.0.0",
          isDefault: false,
        },
      }),
    );
    expect(logger.records).toContainEqual(
      expect.objectContaining({
        message: "Default LLM provider changed",
        context: {
          providerName: "original",
          providerVersion: "1.0.0",
        },
      }),
    );
  });
});

describe("LLM provider registry lifecycle", () => {
  it("rejects registration and default changes after startup", async () => {
    const agent = new AgentForge().registerLLMProvider(createProvider("first"));
    await agent.start();

    expect(() => agent.registerLLMProvider(createProvider("late"))).toThrow(
      InvalidLifecycleOperationError,
    );
    expect(() => agent.setDefaultLLMProvider("first")).toThrow(
      InvalidLifecycleOperationError,
    );
    await agent.stop();
    expect(() => agent.registerLLMProvider(createProvider("late"))).toThrow(
      InvalidLifecycleOperationError,
    );
    expect(() => agent.setDefaultLLMProvider("first")).toThrow(
      InvalidLifecycleOperationError,
    );
  });

  it("supports inspection throughout successful lifecycle states", async () => {
    const provider = createProvider("example");
    const agent = new AgentForge().registerLLMProvider(provider, {
      default: true,
    });
    agent.register(
      createPlugin(
        "observer",
        () => {
          expect(agent.getState()).toBe(AgentForgeState.Starting);
          expectRegistry(agent, ["example"]);
          expect(() =>
            agent.registerLLMProvider(createProvider("late")),
          ).toThrow(InvalidLifecycleOperationError);
          expect(() => agent.setDefaultLLMProvider("example")).toThrow(
            InvalidLifecycleOperationError,
          );
        },
        () => {
          expect(agent.getState()).toBe(AgentForgeState.Stopping);
          expectRegistry(agent, ["example"]);
          expect(() =>
            agent.registerLLMProvider(createProvider("late")),
          ).toThrow(InvalidLifecycleOperationError);
          expect(() => agent.setDefaultLLMProvider("example")).toThrow(
            InvalidLifecycleOperationError,
          );
        },
      ),
    );

    expect(agent.getState()).toBe(AgentForgeState.Created);
    expectRegistry(agent, ["example"]);
    await agent.start();
    expect(agent.getState()).toBe(AgentForgeState.Running);
    expectRegistry(agent, ["example"]);
    await agent.stop();
    expect(agent.getState()).toBe(AgentForgeState.Stopped);
    expectRegistry(agent, ["example"]);
  });

  it("keeps the registry stable after plugin initialization failure", async () => {
    const provider = createProvider("example");
    const agent = new AgentForge()
      .registerLLMProvider(provider, { default: true })
      .register(
        createPlugin("broken", () => {
          throw new Error("initialization failed");
        }),
      );

    await expect(agent.start()).rejects.toBeInstanceOf(
      PluginInitializationError,
    );
    expect(agent.getState()).toBe(AgentForgeState.Failed);
    expectRegistry(agent, ["example"]);
    expect(agent.getDefaultLLMProvider()).toBe(provider);
    expect(() => agent.registerLLMProvider(createProvider("late"))).toThrow(
      InvalidLifecycleOperationError,
    );
    expect(() => agent.setDefaultLLMProvider("example")).toThrow(
      InvalidLifecycleOperationError,
    );
  });

  it("keeps the registry stable after plugin shutdown failure", async () => {
    const provider = createProvider("example");
    const agent = new AgentForge()
      .registerLLMProvider(provider, { default: true })
      .register(
        createPlugin(
          "broken",
          () => undefined,
          () => {
            throw new Error("shutdown failed");
          },
        ),
      );
    await agent.start();

    await expect(agent.stop()).rejects.toBeInstanceOf(PluginShutdownError);
    expect(agent.getState()).toBe(AgentForgeState.Failed);
    expectRegistry(agent, ["example"]);
    expect(agent.getDefaultLLMProvider()).toBe(provider);
  });
});

describe("PluginContext LLM provider registry", () => {
  it("provides the same read-only registry view to every plugin", async () => {
    const provider = createProvider("example");
    const registries: LLMProviderRegistry[] = [];
    const agent = new AgentForge()
      .registerLLMProvider(provider, { default: true })
      .register(
        createPlugin("first", (context) => {
          registries.push(context.llmProviders);
        }),
      )
      .register(
        createPlugin("second", (context) => {
          registries.push(context.llmProviders);
        }),
      );

    await agent.start();

    expect(registries).toHaveLength(2);
    expect(registries[0]).toBe(registries[1]);
    expect(registries[0]?.has("example")).toBe(true);
    expect(registries[0]?.get("example")).toBe(provider);
    expect(registries[0]?.getMetadata("example")).toEqual({
      name: "example",
      version: "1.0.0",
    });
    expect(registries[0]?.getDefault()).toBe(provider);
    const firstList = registries[0]?.list();
    const secondList = registries[0]?.list();
    expect(firstList).toEqual([{ name: "example", version: "1.0.0" }]);
    expect(Object.isFrozen(firstList)).toBe(true);
    expect(firstList).not.toBe(secondList);
    expect(Object.isFrozen(registries[0])).toBe(true);
    expect("register" in (registries[0] as object)).toBe(false);
    expect("setDefault" in (registries[0] as object)).toBe(false);
  });
});

describe("LLM provider registry logging", () => {
  it("logs registration and explicit default selection without provider data", () => {
    const logger = new RecordingLogger();
    const provider = createProvider(
      "example",
      "1.2.3",
      "Sensitive provider description",
    );
    const agent = new AgentForge(undefined, { logger }).registerLLMProvider(
      provider,
    );

    agent.setDefaultLLMProvider("example");

    expect(logger.records).toContainEqual(
      expect.objectContaining({
        level: "debug",
        message: "LLM provider registered",
        context: {
          providerName: "example",
          providerVersion: "1.2.3",
          isDefault: false,
        },
      }),
    );
    expect(logger.records).toContainEqual(
      expect.objectContaining({
        level: "debug",
        message: "Default LLM provider changed",
        context: {
          providerName: "example",
          providerVersion: "1.2.3",
        },
      }),
    );
    expect(JSON.stringify(logger.records)).not.toContain(
      "Sensitive provider description",
    );
    expect(logger.records.some(({ context }) => context === provider)).toBe(
      false,
    );
  });

  it("does not perform health checks during registration", () => {
    let healthChecks = 0;
    const provider = createProvider("example", "1.0.0", undefined, async () => {
      healthChecks += 1;
      return healthyProvider();
    });

    new AgentForge().registerLLMProvider(provider, { default: true });

    expect(healthChecks).toBe(0);
  });
});
