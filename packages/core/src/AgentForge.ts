/**
 * Main framework entry point.
 *
 * The framework exposes a single facade responsible for bootstrapping
 * and managing registered plugins.
 */
import {
  type AgentForgeConfig,
  type AgentForgeConfigInput,
  loadConfig,
} from "@agentforge/config";
import { type Logger, createLogger } from "@agentforge/logger";
import type { Plugin } from "@agentforge/plugin-sdk";
import {
  DuplicatePluginError,
  InvalidLifecycleOperationError,
  InvalidPluginNameError,
  PluginInitializationError,
  PluginShutdownError,
  type PluginShutdownFailure,
} from "@agentforge/shared";
import type { AgentForgeOptions } from "./AgentForgeOptions.js";
import { AgentForgeState } from "./AgentForgeState.js";
import { AGENTFORGE_VERSION } from "./version.js";

interface InitializedPlugin {
  readonly plugin: Plugin;
  readonly logger: Logger;
}

export class AgentForge {
  private readonly config: Readonly<AgentForgeConfig>;
  private readonly logger: Logger;
  private readonly plugins: Plugin[] = [];
  private readonly pluginNames = new Set<string>();
  private readonly initializedPlugins: InitializedPlugin[] = [];
  private state = AgentForgeState.Created;

  constructor(config?: AgentForgeConfigInput, options?: AgentForgeOptions) {
    this.config = loadConfig(config);
    this.logger = (options?.logger ?? createLogger()).child({
      component: "agentforge",
      instanceName: this.config.instanceName,
    });
  }

  register(plugin: Plugin): this {
    this.assertState("register a plugin", AgentForgeState.Created);

    if (plugin.name.trim().length === 0) {
      throw new InvalidPluginNameError();
    }

    if (this.pluginNames.has(plugin.name)) {
      throw new DuplicatePluginError(plugin.name);
    }

    this.plugins.push(plugin);
    this.pluginNames.add(plugin.name);

    return this;
  }

  async start(): Promise<void> {
    this.assertState("start", AgentForgeState.Created);
    this.state = AgentForgeState.Starting;
    this.logger.info("AgentForge is starting", {
      pluginCount: this.plugins.length,
    });

    for (const plugin of this.plugins) {
      const pluginLogger = this.logger.child({
        component: "plugin",
        pluginName: plugin.name,
      });

      try {
        pluginLogger.debug("Plugin is initializing");
        await plugin.initialize({
          frameworkVersion: AGENTFORGE_VERSION,
          instanceName: this.config.instanceName,
          configuration: this.config.plugins[plugin.name],
          logger: pluginLogger,
        });
        this.initializedPlugins.push({ plugin, logger: pluginLogger });
        pluginLogger.debug("Plugin initialized");
      } catch (error) {
        pluginLogger.error("Plugin initialization failed", { error });
        await this.rollbackStartup();
        this.state = AgentForgeState.Failed;
        throw new PluginInitializationError(plugin.name, error);
      }
    }

    this.state = AgentForgeState.Running;
    this.logger.info("AgentForge started");
  }

  async stop(): Promise<void> {
    this.assertState("stop", AgentForgeState.Running);
    this.state = AgentForgeState.Stopping;
    this.logger.info("AgentForge is stopping");

    const failures: PluginShutdownFailure[] = [];

    for (const { plugin, logger } of [...this.initializedPlugins].reverse()) {
      if (!plugin.shutdown) {
        continue;
      }

      try {
        logger.debug("Plugin is shutting down");
        await plugin.shutdown();
        logger.debug("Plugin shut down");
      } catch (error) {
        logger.error("Plugin shutdown failed", { error });
        failures.push({ pluginName: plugin.name, error });
      }
    }

    if (failures.length > 0) {
      this.state = AgentForgeState.Failed;
      throw new PluginShutdownError(failures);
    }

    this.state = AgentForgeState.Stopped;
    this.logger.info("AgentForge stopped");
  }

  getState(): AgentForgeState {
    return this.state;
  }

  getConfig(): Readonly<AgentForgeConfig> {
    return this.config;
  }

  getPluginCount(): number {
    return this.plugins.length;
  }

  private assertState(operation: string, expectedState: AgentForgeState): void {
    if (this.state !== expectedState) {
      throw new InvalidLifecycleOperationError(operation, this.state);
    }
  }

  private async rollbackStartup(): Promise<void> {
    // Rollback is best-effort so one shutdown failure cannot prevent later cleanup.
    for (const { plugin, logger } of [...this.initializedPlugins].reverse()) {
      try {
        await plugin.shutdown?.();
      } catch (error) {
        logger.warn("Plugin rollback shutdown failed", { error });
        // The initialization error remains the primary lifecycle failure.
      }
    }
  }
}
