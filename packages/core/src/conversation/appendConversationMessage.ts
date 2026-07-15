import type { Conversation } from "./Conversation.js";
import type { ConversationFactoryOptions } from "./ConversationIdGenerator.js";
import type { AppendConversationMessageInput } from "./ConversationInput.js";
import { createConversationMessage } from "./createConversationMessage.js";
import { InvalidConversationMessageError } from "./errors/index.js";
import { validateConversation } from "./internal/validateConversation.js";
import { parseIsoTimestamp } from "./internal/validation.js";

export function appendConversationMessage(
  conversation: Conversation,
  input: AppendConversationMessageInput,
  options?: ConversationFactoryOptions,
): Readonly<Conversation> {
  validateConversation(conversation);
  const message = createConversationMessage(input, options);

  if (conversation.messages.some(({ id }) => id === message.id)) {
    throw new InvalidConversationMessageError([
      `id: duplicate message ID "${message.id}"`,
    ]);
  }
  const messageTimestamp = parseIsoTimestamp(message.createdAt) as number;
  const updatedTimestamp = parseIsoTimestamp(conversation.updatedAt) as number;
  if (messageTimestamp < updatedTimestamp) {
    throw new InvalidConversationMessageError([
      "createdAt: must not be earlier than the conversation updatedAt",
    ]);
  }

  const result: Conversation = Object.freeze({
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: message.createdAt,
    messages: Object.freeze([...conversation.messages, message]),
  });
  validateConversation(result);
  return result;
}
