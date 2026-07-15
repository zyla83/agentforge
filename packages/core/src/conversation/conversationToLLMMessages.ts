import type { LLMMessage } from "@agentforge/provider-sdk";
import type { Conversation } from "./Conversation.js";
import { validateConversation } from "./internal/validateConversation.js";

export function conversationToLLMMessages(
  conversation: Conversation,
): readonly Readonly<LLMMessage>[] {
  validateConversation(conversation);
  return Object.freeze(
    conversation.messages.map(({ role, content }) =>
      Object.freeze({ role, content }),
    ),
  );
}
