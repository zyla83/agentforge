import type { LLMGenerationResponse } from "@agentforge/provider-sdk";
import type { ToolCall, ToolResult } from "@agentforge/provider-sdk";
import type {
  Conversation,
  ConversationMessage,
} from "../conversation/index.js";
import type { ToolExecutionRecord } from "../tools/index.js";

export interface ConversationStreamStartedEvent {
  readonly type: "started";
  readonly conversation: Readonly<Conversation>;
  readonly userMessage: Readonly<ConversationMessage>;
  readonly provider: string;
  readonly model: string;
  readonly profile: string | undefined;
}

export interface ConversationStreamDeltaEvent {
  readonly type: "delta";
  readonly delta: string;
  readonly content: string;
  readonly provider: string;
  readonly model: string;
  readonly profile: string | undefined;
}

export interface ConversationStreamCompletedEvent {
  readonly type: "completed";
  readonly conversation: Readonly<Conversation>;
  readonly userMessage: Readonly<ConversationMessage>;
  readonly assistantMessage: Readonly<ConversationMessage>;
  readonly response: Readonly<LLMGenerationResponse>;
  readonly provider: string;
  readonly model: string;
  readonly profile: string | undefined;
  readonly toolExecutions: readonly Readonly<ToolExecutionRecord>[];
  readonly providerRounds: number;
}

export interface ConversationStreamToolCallStartedEvent {
  readonly type: "tool-call-started";
  readonly call: Readonly<ToolCall>;
  readonly round: number;
}

export interface ConversationStreamToolCallCompletedEvent {
  readonly type: "tool-call-completed";
  readonly call: Readonly<ToolCall>;
  readonly result: Readonly<ToolResult>;
  readonly round: number;
}

export type ConversationStreamEvent =
  | ConversationStreamStartedEvent
  | ConversationStreamDeltaEvent
  | ConversationStreamToolCallStartedEvent
  | ConversationStreamToolCallCompletedEvent
  | ConversationStreamCompletedEvent;
