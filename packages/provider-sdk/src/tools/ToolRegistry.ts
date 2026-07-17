import type { RegisteredTool } from "./RegisteredTool.js";
import type { ToolDefinition } from "./ToolDefinition.js";

export interface ToolRegistry {
  has(name: string): boolean;

  get(name: string): Readonly<RegisteredTool> | undefined;

  require(name: string): Readonly<RegisteredTool>;

  getDefinition(name: string): Readonly<ToolDefinition> | undefined;

  list(): readonly Readonly<RegisteredTool>[];

  listDefinitions(): readonly Readonly<ToolDefinition>[];
}
