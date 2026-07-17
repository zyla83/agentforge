import type {
  AgentForge,
  AgentProfile,
  ConversationEngine,
  ConversationStore,
  ConversationStoreEntry,
} from "@agentforge/core";

export interface ChatApplicationOptions {
  readonly agent: AgentForge;
  readonly engine: ConversationEngine;
  readonly profile: AgentProfile;
  readonly store: ConversationStore;
  readonly initialEntry: Readonly<ConversationStoreEntry>;
  readonly dataDirectory: string;
  readonly timeoutMs: number;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly errorOutput: NodeJS.WritableStream;
}
