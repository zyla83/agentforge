export enum LLMFinishReason {
  Stop = "stop",
  Length = "length",
  Aborted = "aborted",
  Error = "error",
  Unknown = "unknown",
  ToolCalls = "tool_calls",
}
