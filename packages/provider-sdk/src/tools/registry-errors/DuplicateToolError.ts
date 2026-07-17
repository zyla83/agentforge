import { ToolRegistryError } from "./ToolRegistryError.js";

export class DuplicateToolError extends ToolRegistryError {
  readonly toolName: string;

  constructor(toolName: string, options?: ErrorOptions) {
    super(`A tool named "${toolName}" is already registered.`, options);
    this.name = "DuplicateToolError";
    this.toolName = toolName;
  }
}
