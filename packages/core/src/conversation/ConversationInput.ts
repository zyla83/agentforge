import type { LLMMessageRole } from "@agentforge/provider-sdk";

export interface ConversationMessageInput {
  readonly id?: string;
  readonly role: LLMMessageRole;
  readonly content: string;
  readonly createdAt?: string;
}

export interface AppendConversationMessageInput
  extends ConversationMessageInput {}

export interface CreateConversationInput {
  readonly id?: string;
  readonly createdAt?: string;
  readonly messages?: readonly ConversationMessageInput[];
}
