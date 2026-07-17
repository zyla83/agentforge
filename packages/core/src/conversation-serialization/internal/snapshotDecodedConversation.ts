import {
  LLMMessageRole,
  createToolCall,
  createToolResult,
} from "@agentforge/provider-sdk";
import type { Conversation } from "../../conversation/index.js";
import type { ConversationMessage } from "../../conversation/index.js";
import { InvalidConversationError } from "../../conversation/index.js";
import { validateConversation } from "../../conversation/internal/validateConversation.js";
import type {
  SerializedConversationV1,
  SerializedConversationV2,
} from "../ConversationDocument.js";
import { InvalidConversationDocumentError } from "../errors/index.js";

type SerializedConversationValue =
  | SerializedConversationV1
  | SerializedConversationV2;

export function buildSerializedConversationValue(
  conversation: Conversation,
): SerializedConversationValue {
  validateRuntimeConversation(conversation);
  try {
    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) => {
        const base = {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        };
        if ("toolCalls" in message)
          return { ...base, toolCalls: message.toolCalls };
        if (message.role === LLMMessageRole.Tool) {
          return {
            ...base,
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            result: message.result,
          };
        }
        return base;
      }),
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
      value.messages.map((message): Readonly<ConversationMessage> => {
        const base = {
          id: message.id,
          role: message.role as LLMMessageRole,
          content: message.content,
          createdAt: message.createdAt,
        };
        if ("toolCalls" in message) {
          return Object.freeze({
            ...base,
            role: LLMMessageRole.Assistant,
            toolCalls: Object.freeze(
              message.toolCalls.map((call) => createToolCall(call)),
            ),
          }) as Readonly<ConversationMessage>;
        }
        if ("result" in message) {
          return Object.freeze({
            ...base,
            role: LLMMessageRole.Tool,
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            result: createToolResult(message.result),
          }) as Readonly<ConversationMessage>;
        }
        return Object.freeze(base) as Readonly<ConversationMessage>;
      }),
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
