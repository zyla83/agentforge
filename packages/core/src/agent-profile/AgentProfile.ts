import type { LLMGenerationOptions } from "@agentforge/provider-sdk";

export interface AgentProfile {
  readonly id: string;
  readonly systemPrompt: string;
  readonly model?: string;
  readonly provider?: string;
  readonly generation?: Readonly<LLMGenerationOptions>;
}
