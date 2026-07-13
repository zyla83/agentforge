export interface PluginContext {
  readonly frameworkVersion: string;
}

export interface Plugin {
  readonly name: string;

  initialize(context: PluginContext): Promise<void>;

  shutdown?(): Promise<void>;
}
