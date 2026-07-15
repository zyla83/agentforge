import type { Logger } from "@agentforge/logger";

export interface PluginContext {
  readonly frameworkVersion: string;
  readonly instanceName: string;
  readonly configuration: unknown;
  readonly logger: Logger;
}

export interface Plugin {
  readonly name: string;

  initialize(context: PluginContext): Promise<void>;

  shutdown?(): Promise<void>;
}
