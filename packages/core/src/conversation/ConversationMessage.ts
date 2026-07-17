import type { ToolCall, ToolResult } from "@agentforge/provider-sdk";
import type { LLMMessageRole } from "@agentforge/provider-sdk";

interface ConversationMessageBase {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface ConversationSystemMessage extends ConversationMessageBase {
  readonly role: LLMMessageRole.System;
}

export interface ConversationUserMessage extends ConversationMessageBase {
  readonly role: LLMMessageRole.User;
}

export interface ConversationAssistantMessage extends ConversationMessageBase {
  readonly role: LLMMessageRole.Assistant;
}

export interface ConversationAssistantToolCallMessage
  extends ConversationMessageBase {
  readonly role: LLMMessageRole.Assistant;
  readonly toolCalls: readonly Readonly<ToolCall>[];
}

export interface ConversationToolResultMessage extends ConversationMessageBase {
  readonly role: LLMMessageRole.Tool;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: Readonly<ToolResult>;
}

export type ConversationMessage =
  | ConversationSystemMessage
  | ConversationUserMessage
  | ConversationAssistantMessage
  | ConversationAssistantToolCallMessage
  | ConversationToolResultMessage;
