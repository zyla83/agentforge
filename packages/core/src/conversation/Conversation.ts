import type { ConversationMessage } from "./ConversationMessage.js";

export interface Conversation {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly Readonly<ConversationMessage>[];
}
