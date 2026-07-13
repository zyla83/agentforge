/**
 * Main framework entry point.
 *
 * The framework exposes a single facade responsible for bootstrapping
 * and managing registered plugins.
 */
import type { Plugin } from "@agentforge/plugin-sdk";

export class AgentForge {
  private readonly plugins: Plugin[] = [];

  register(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  async start(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.initialize();
    }
  }

  getPluginCount(): number {
    return this.plugins.length;
  }
}
