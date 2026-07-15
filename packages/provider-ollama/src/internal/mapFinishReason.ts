import { LLMFinishReason } from "@agentforge/provider-sdk";

export function mapFinishReason(
  done: boolean,
  doneReason?: string,
): LLMFinishReason {
  if (doneReason === "stop") {
    return LLMFinishReason.Stop;
  }
  if (
    doneReason === "length" ||
    doneReason === "limit" ||
    doneReason === "max_tokens"
  ) {
    return LLMFinishReason.Length;
  }
  if (doneReason === undefined) {
    return done ? LLMFinishReason.Stop : LLMFinishReason.Unknown;
  }
  return LLMFinishReason.Unknown;
}
