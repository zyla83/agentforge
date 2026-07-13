export class AgentForgeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentForgeError";
  }
}

export class DuplicatePluginError extends AgentForgeError {
  readonly pluginName: string;

  constructor(pluginName: string) {
    super(`Plugin "${pluginName}" is already registered.`);
    this.name = "DuplicatePluginError";
    this.pluginName = pluginName;
  }
}

export class InvalidPluginNameError extends AgentForgeError {
  constructor() {
    super("Plugin name must contain at least one non-whitespace character.");
    this.name = "InvalidPluginNameError";
  }
}

export class InvalidLifecycleOperationError extends AgentForgeError {
  readonly operation: string;
  readonly state: string;

  constructor(operation: string, state: string) {
    super(`Cannot ${operation} while AgentForge is in the "${state}" state.`);
    this.name = "InvalidLifecycleOperationError";
    this.operation = operation;
    this.state = state;
  }
}

export class PluginInitializationError extends AgentForgeError {
  readonly pluginName: string;

  constructor(pluginName: string, cause: unknown) {
    super(`Plugin "${pluginName}" failed to initialize.`, { cause });
    this.name = "PluginInitializationError";
    this.pluginName = pluginName;
  }
}

export interface PluginShutdownFailure {
  readonly pluginName: string;
  readonly error: unknown;
}

export class PluginShutdownError extends AgentForgeError {
  readonly failures: readonly PluginShutdownFailure[];

  constructor(failures: readonly PluginShutdownFailure[]) {
    const failureCopies = failures.map((failure) => ({ ...failure }));
    const pluginNames = failureCopies
      .map((failure) => `"${failure.pluginName}"`)
      .join(", ");
    const aggregateError = new AggregateError(
      failureCopies.map((failure) => failure.error),
      "One or more plugins failed to shut down.",
    );

    super(`Plugin shutdown failed for: ${pluginNames}.`, {
      cause: aggregateError,
    });
    this.name = "PluginShutdownError";
    this.failures = failureCopies;
  }
}
