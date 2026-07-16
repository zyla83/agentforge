import type { LLMGenerationOptions } from "@agentforge/provider-sdk";
import type { AgentProfile } from "./AgentProfile.js";
import type { AgentProfileInput } from "./AgentProfileInput.js";
import { validateAgentProfile } from "./internal/index.js";

export function createAgentProfile(
  input: AgentProfileInput,
): Readonly<AgentProfile> {
  validateAgentProfile(input);

  return Object.freeze({
    id: input.id,
    systemPrompt: input.systemPrompt,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.generation === undefined
      ? {}
      : { generation: snapshotGeneration(input.generation) }),
  });
}

function snapshotGeneration(
  generation: LLMGenerationOptions,
): Readonly<LLMGenerationOptions> {
  return Object.freeze({
    ...(generation.temperature === undefined
      ? {}
      : { temperature: generation.temperature }),
    ...(generation.topP === undefined ? {} : { topP: generation.topP }),
    ...(generation.maxTokens === undefined
      ? {}
      : { maxTokens: generation.maxTokens }),
    ...(generation.stop === undefined
      ? {}
      : { stop: Object.freeze([...generation.stop]) }),
  });
}
