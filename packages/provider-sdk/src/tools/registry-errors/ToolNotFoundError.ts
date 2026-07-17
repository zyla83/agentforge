import { ToolRegistryError } from "./ToolRegistryError.js";

export class ToolNotFoundError extends ToolRegistryError {
  readonly toolName: string;

  constructor(toolName: string, options?: ErrorOptions) {
    super(`Tool "${toolName}" is not registered.`, options);
    this.name = "ToolNotFoundError";
    this.toolName = toolName;
  }
}
