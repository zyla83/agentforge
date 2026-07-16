import type { LLMProvider } from "@agentforge/provider-sdk";

export interface ConversationProviderResolver {
  getLLMProvider(name: string): LLMProvider | undefined;
  getDefaultLLMProvider(): LLMProvider | undefined;
}
