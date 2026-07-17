import type {
  AgentForge,
  AgentProfile,
  ConversationEngine,
  ConversationStore,
  ConversationStoreEntry,
} from "@agentforge/core";
import type { ToolDefinition } from "@agentforge/provider-sdk";
import type { ChatToolMode } from "./environment.js";

export interface ChatApplicationToolOptions {
  readonly mode: ChatToolMode;
  readonly definitions: readonly Readonly<ToolDefinition>[];
}

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
  readonly tools: Readonly<ChatApplicationToolOptions>;
}
