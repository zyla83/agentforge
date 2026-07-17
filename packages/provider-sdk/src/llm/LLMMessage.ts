import type { ToolCall, ToolResult } from "../tools/index.js";

export enum LLMMessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
}

export interface LLMSystemMessage {
  readonly role: LLMMessageRole.System;
  readonly content: string;
}

export interface LLMUserMessage {
  readonly role: LLMMessageRole.User;
  readonly content: string;
}

export interface LLMAssistantTextMessage {
  readonly role: LLMMessageRole.Assistant;
  readonly content: string;
}

export interface LLMAssistantToolCallMessage {
  readonly role: LLMMessageRole.Assistant;
  readonly content: string;
  readonly toolCalls: readonly Readonly<ToolCall>[];
}

export interface LLMToolResultMessage {
  readonly role: LLMMessageRole.Tool;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly content: string;
  readonly result: Readonly<ToolResult>;
}

export type LLMMessage =
  | LLMSystemMessage
  | LLMUserMessage
  | LLMAssistantTextMessage
  | LLMAssistantToolCallMessage
  | LLMToolResultMessage;
