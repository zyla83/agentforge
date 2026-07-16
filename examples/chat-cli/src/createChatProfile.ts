import { createAgentProfile } from "@agentforge/core";
import type { AgentProfile } from "@agentforge/core";
import type { ChatEnvironment } from "./environment.js";

export function createChatProfile(
  environment: ChatEnvironment,
  providerName: string,
): Readonly<AgentProfile> {
  return createAgentProfile({
    id: "interactive-chat",
    systemPrompt: environment.systemPrompt,
    model: environment.model,
    provider: providerName,
    generation: { temperature: 0.2 },
  });
}
