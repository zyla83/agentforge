import type {
  AgentForge,
  AgentProfile,
  Conversation,
  ConversationEngine,
} from "@agentforge/core";

export interface ChatApplicationOptions {
  readonly agent: AgentForge;
  readonly engine: ConversationEngine;
  readonly profile: AgentProfile;
  readonly initialConversation: Conversation;
  readonly timeoutMs: number;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly errorOutput: NodeJS.WritableStream;
}
