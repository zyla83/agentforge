import type { LLMMessage } from "@agentforge/provider-sdk";
import type { Conversation } from "./Conversation.js";
import { validateConversation } from "./internal/validateConversation.js";

export function conversationToLLMMessages(
  conversation: Conversation,
): readonly Readonly<LLMMessage>[] {
  validateConversation(conversation);
  return Object.freeze(
    conversation.messages.map((message): Readonly<LLMMessage> => {
      if ("toolCalls" in message) {
        return Object.freeze({
          role: message.role,
          content: message.content,
          toolCalls: message.toolCalls,
        });
      }
      if (message.role === "tool") {
        return Object.freeze({
          role: message.role,
          content: message.content,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          result: message.result,
        });
      }
      return Object.freeze({
        role: message.role,
        content: message.content,
      }) as Readonly<LLMMessage>;
    }),
  );
}
