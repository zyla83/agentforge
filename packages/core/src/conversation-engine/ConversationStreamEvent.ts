import type { LLMGenerationResponse } from "@agentforge/provider-sdk";
import type {
  Conversation,
  ConversationMessage,
} from "../conversation/index.js";

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
}

export type ConversationStreamEvent =
  | ConversationStreamStartedEvent
  | ConversationStreamDeltaEvent
  | ConversationStreamCompletedEvent;
