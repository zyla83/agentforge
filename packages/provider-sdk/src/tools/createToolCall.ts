import type { ToolCall } from "./ToolCall.js";
import { snapshotToolCall } from "./validateToolCall.js";

export function createToolCall(call: ToolCall): Readonly<ToolCall> {
  return snapshotToolCall(call);
}
