import type { ToolInputSchema } from "./JsonSchema.js";

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<ToolInputSchema>;
}
