import type { LLMMessageRole } from "@agentforge/provider-sdk";

export interface ConversationMessage {
  readonly id: string;
  readonly role: LLMMessageRole;
  readonly content: string;
  readonly createdAt: string;
}
