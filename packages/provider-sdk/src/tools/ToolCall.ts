import type { ToolArguments } from "./JsonValue.js";

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: ToolArguments;
}
