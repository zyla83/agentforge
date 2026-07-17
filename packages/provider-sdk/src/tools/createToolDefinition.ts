import type { ToolDefinition } from "./ToolDefinition.js";
import { snapshotToolDefinition } from "./validateToolDefinition.js";

export function createToolDefinition(
  definition: ToolDefinition,
): Readonly<ToolDefinition> {
  return snapshotToolDefinition(definition);
}
