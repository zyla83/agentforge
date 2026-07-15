import type { Conversation } from "./Conversation.js";
import { validateConversation } from "./internal/validateConversation.js";

export interface SerializedConversationMessage {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface SerializedConversation {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly SerializedConversationMessage[];
}

export function serializeConversation(
  conversation: Conversation,
): Readonly<SerializedConversation> {
  validateConversation(conversation);
  const messages = Object.freeze(
    conversation.messages.map(({ id, role, content, createdAt }) =>
      Object.freeze({ id, role, content, createdAt }),
    ),
  );
  return Object.freeze({
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages,
  });
}
