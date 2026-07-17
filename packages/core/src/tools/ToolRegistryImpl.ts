import {
  DuplicateToolError,
  type RegisteredTool,
  type ToolDefinition,
  type ToolHandler,
  ToolNotFoundError,
  type ToolRegistry,
  ToolRegistryError,
  createToolDefinition,
} from "@agentforge/provider-sdk";

const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;

export class ToolRegistryImpl implements ToolRegistry {
  private readonly tools: Readonly<RegisteredTool>[] = [];
  private readonly toolsByName = new Map<string, Readonly<RegisteredTool>>();
  private readonly view: ToolRegistry;

  constructor() {
    this.view = Object.freeze({
      has: (name: string) => this.has(name),
      get: (name: string) => this.get(name),
      require: (name: string) => this.require(name),
      getDefinition: (name: string) => this.getDefinition(name),
      list: () => this.list(),
      listDefinitions: () => this.listDefinitions(),
    });
  }

  register(
    definition: ToolDefinition,
    handler: ToolHandler,
  ): Readonly<RegisteredTool> {
    const definitionSnapshot = createToolDefinition(definition);
    if (typeof handler !== "function") {
      throw new ToolRegistryError(
        "Tool registration is invalid: handler must be a function.",
      );
    }
    if (this.toolsByName.has(definitionSnapshot.name)) {
      throw new DuplicateToolError(definitionSnapshot.name);
    }

    const registered = Object.freeze({
      definition: definitionSnapshot,
      handler,
    });
    this.tools.push(registered);
    this.toolsByName.set(definitionSnapshot.name, registered);
    return registered;
  }

  has(name: string): boolean {
    return isValidLookupName(name) && this.toolsByName.has(name);
  }

  get(name: string): Readonly<RegisteredTool> | undefined {
    return isValidLookupName(name) ? this.toolsByName.get(name) : undefined;
  }

  require(name: string): Readonly<RegisteredTool> {
    if (!isValidLookupName(name)) {
      throw new ToolRegistryError(
        `Tool registry lookup is invalid: name must match ${TOOL_NAME_PATTERN.source}.`,
      );
    }
    const registered = this.toolsByName.get(name);
    if (registered === undefined) throw new ToolNotFoundError(name);
    return registered;
  }

  getDefinition(name: string): Readonly<ToolDefinition> | undefined {
    return this.get(name)?.definition;
  }

  list(): readonly Readonly<RegisteredTool>[] {
    return Object.freeze([...this.tools]);
  }

  listDefinitions(): readonly Readonly<ToolDefinition>[] {
    return Object.freeze(this.tools.map(({ definition }) => definition));
  }

  getView(): ToolRegistry {
    return this.view;
  }
}

function isValidLookupName(value: unknown): value is string {
  return typeof value === "string" && TOOL_NAME_PATTERN.test(value);
}
