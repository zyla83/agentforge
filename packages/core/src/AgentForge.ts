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
import type { Plugin } from "@agentforge/plugin-sdk";
import {
  DuplicatePluginError,
  InvalidLifecycleOperationError,
  InvalidPluginNameError,
  PluginInitializationError,
  PluginShutdownError,
  type PluginShutdownFailure,
} from "@agentforge/shared";
import { AgentForgeState } from "./AgentForgeState.js";
import { AGENTFORGE_VERSION } from "./version.js";

export class AgentForge {
  private readonly config: Readonly<AgentForgeConfig>;
  private readonly plugins: Plugin[] = [];
  private readonly pluginNames = new Set<string>();
  private readonly initializedPlugins: Plugin[] = [];
  private state = AgentForgeState.Created;

  constructor(config?: AgentForgeConfigInput) {
    this.config = loadConfig(config);
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

    for (const plugin of this.plugins) {
      try {
        await plugin.initialize({
          frameworkVersion: AGENTFORGE_VERSION,
          instanceName: this.config.instanceName,
          configuration: this.config.plugins[plugin.name],
        });
        this.initializedPlugins.push(plugin);
      } catch (error) {
        await this.rollbackStartup();
        this.state = AgentForgeState.Failed;
        throw new PluginInitializationError(plugin.name, error);
      }
    }

    this.state = AgentForgeState.Running;
  }

  async stop(): Promise<void> {
    this.assertState("stop", AgentForgeState.Running);
    this.state = AgentForgeState.Stopping;

    const failures: PluginShutdownFailure[] = [];

    for (const plugin of [...this.initializedPlugins].reverse()) {
      if (!plugin.shutdown) {
        continue;
      }

      try {
        await plugin.shutdown();
      } catch (error) {
        failures.push({ pluginName: plugin.name, error });
      }
    }

    if (failures.length > 0) {
      this.state = AgentForgeState.Failed;
      throw new PluginShutdownError(failures);
    }

    this.state = AgentForgeState.Stopped;
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
    for (const plugin of [...this.initializedPlugins].reverse()) {
      try {
        await plugin.shutdown?.();
      } catch {
        // The initialization error remains the primary lifecycle failure.
      }
    }
  }
}
