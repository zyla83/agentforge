import type { OllamaChatResponse } from "@agentforge/ollama-client";
import { LLMMessageRole, createLLMTokenUsage } from "@agentforge/provider-sdk";
import type { LLMGenerationResponse } from "@agentforge/provider-sdk";
import { mapFinishReason } from "./mapFinishReason.js";

export function mapGenerationResponse(
  response: OllamaChatResponse,
): LLMGenerationResponse {
  const message = Object.freeze({
    role: LLMMessageRole.Assistant,
    content: response.message.content,
  });
  const result: {
    model: string;
    message: typeof message;
    finishReason: ReturnType<typeof mapFinishReason>;
    usage?: ReturnType<typeof createLLMTokenUsage>;
  } = {
    model: response.model,
    message,
    finishReason: mapFinishReason(response.done, response.doneReason),
  };

  if (
    response.promptEvalCount !== undefined ||
    response.evalCount !== undefined
  ) {
    result.usage = createLLMTokenUsage(
      response.promptEvalCount ?? 0,
      response.evalCount ?? 0,
    );
  }
  return Object.freeze(result);
}
