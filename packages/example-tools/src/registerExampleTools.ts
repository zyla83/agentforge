import type { ToolDefinition, ToolHandler } from "@agentforge/provider-sdk";
import { exampleTools } from "./tools.js";

export interface ExampleToolRegistrationTarget {
  registerTool(
    definition: Readonly<ToolDefinition>,
    handler: ToolHandler,
  ): unknown;
}

export function registerExampleTools(
  target: ExampleToolRegistrationTarget,
): void {
  for (const { definition, handler } of exampleTools) {
    target.registerTool(definition, handler);
  }
}
