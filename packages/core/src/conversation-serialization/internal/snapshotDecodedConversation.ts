import type { LLMMessageRole } from "@agentforge/provider-sdk";
import type { Conversation } from "../../conversation/index.js";
import { InvalidConversationError } from "../../conversation/index.js";
import { validateConversation } from "../../conversation/internal/validateConversation.js";
import type { ConversationDocumentV1 } from "../ConversationDocument.js";
import { InvalidConversationDocumentError } from "../errors/index.js";

type SerializedConversationValue = ConversationDocumentV1["conversation"];

export function buildSerializedConversationValue(
  conversation: Conversation,
): SerializedConversationValue {
  validateRuntimeConversation(conversation);
  try {
    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map(
        ({ id, role, content, createdAt }) => ({
          id,
          role,
          content,
          createdAt,
        }),
      ),
    };
  } catch (error) {
    throw new InvalidConversationDocumentError(
      ["conversation could not be inspected safely"],
      { cause: error },
    );
  }
}

export function snapshotDecodedConversation(
  value: SerializedConversationValue,
): Readonly<Conversation> {
  try {
    const messages = Object.freeze(
      value.messages.map(({ id, role, content, createdAt }) =>
        Object.freeze({
          id,
          role: role as LLMMessageRole,
          content,
          createdAt,
        }),
      ),
    );
    const conversation: Conversation = Object.freeze({
      id: value.id,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      messages,
    });
    validateRuntimeConversation(conversation);
    return conversation;
  } catch (error) {
    if (error instanceof InvalidConversationDocumentError) throw error;
    throw new InvalidConversationDocumentError(
      ["conversation could not be snapshotted safely"],
      { cause: error },
    );
  }
}

function validateRuntimeConversation(conversation: Conversation): void {
  try {
    validateConversation(conversation);
  } catch (error) {
    if (error instanceof InvalidConversationError) {
      throw new InvalidConversationDocumentError(
        error.details.map((detail) => `conversation.${detail}`),
        { cause: error },
      );
    }
    throw new InvalidConversationDocumentError(
      ["conversation could not be validated"],
      { cause: error },
    );
  }
}
