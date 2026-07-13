export interface PluginContext {
  readonly frameworkVersion: string;
  readonly instanceName: string;
  readonly configuration: unknown;
}

export interface Plugin {
  readonly name: string;

  initialize(context: PluginContext): Promise<void>;

  shutdown?(): Promise<void>;
}
