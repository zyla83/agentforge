import type { ToolDefinition } from "./ToolDefinition.js";
import type { ToolHandler } from "./ToolHandler.js";

export interface RegisteredTool {
  readonly definition: Readonly<ToolDefinition>;
  readonly handler: ToolHandler;
}
