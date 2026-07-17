import type { ToolCall, ToolResult } from "@agentforge/provider-sdk";
import type {
  CONVERSATION_DOCUMENT_KIND,
  CONVERSATION_DOCUMENT_VERSION_1,
  CONVERSATION_DOCUMENT_VERSION_2,
} from "./internal/constants.js";

export interface SerializedTextMessage {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface SerializedAssistantToolCallMessage
  extends SerializedTextMessage {
  readonly toolCalls: readonly Readonly<ToolCall>[];
}

export interface SerializedToolResultMessage extends SerializedTextMessage {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: Readonly<ToolResult>;
}

export interface SerializedConversationV1 {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly SerializedTextMessage[];
}

export interface SerializedConversationV2 {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly (
    | SerializedTextMessage
    | SerializedAssistantToolCallMessage
    | SerializedToolResultMessage
  )[];
}

export interface ConversationDocumentV1 {
  readonly kind: typeof CONVERSATION_DOCUMENT_KIND;
  readonly version: typeof CONVERSATION_DOCUMENT_VERSION_1;
  readonly conversation: SerializedConversationV1;
}

export interface ConversationDocumentV2 {
  readonly kind: typeof CONVERSATION_DOCUMENT_KIND;
  readonly version: typeof CONVERSATION_DOCUMENT_VERSION_2;
  readonly conversation: SerializedConversationV2;
}

export type ConversationDocument =
  | ConversationDocumentV1
  | ConversationDocumentV2;
