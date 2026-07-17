import {
  ConversationNotFoundError,
  ConversationProviderNotFoundError,
  ConversationProviderStreamingUnsupportedError,
  ConversationSerializationError,
  ConversationStoreError,
  ConversationTurnAbortedError,
  InvalidAgentProfileError,
  InvalidConversationTurnError,
} from "@agentforge/core";
import { ProviderAbortError, ProviderError } from "@agentforge/provider-sdk";
import { FilesystemConversationStoreError } from "@agentforge/storage-filesystem";
import { ChatCommandParseError } from "./ChatCommandParseError.js";
import { ChatFileOperationError } from "./files/ChatFileOperationError.js";

export function formatChatError(error: unknown): string {
  try {
    if (error instanceof ConversationTurnAbortedError) {
      return `Conversation cancelled during ${error.phase}.`;
    }
    if (error instanceof ChatCommandParseError) return error.message;
    if (error instanceof ChatFileOperationError) return error.message;
    if (error instanceof ConversationNotFoundError) return error.message;
    if (error instanceof FilesystemConversationStoreError) {
      return `Conversation storage failed: ${error.message}`;
    }
    if (error instanceof ConversationStoreError) {
      return `Conversation storage failed: ${error.message}`;
    }
    if (error instanceof ConversationSerializationError) {
      return `Conversation document is invalid: ${error.message}`;
    }
    if (error instanceof ConversationProviderNotFoundError) {
      return "The configured provider is not registered.";
    }
    if (error instanceof ConversationProviderStreamingUnsupportedError) {
      return "The configured provider does not support streaming.";
    }
    if (error instanceof InvalidConversationTurnError) {
      return `Invalid chat request: ${error.details.join("; ")}.`;
    }
    if (error instanceof InvalidAgentProfileError) {
      return `Invalid chat profile: ${error.details.join("; ")}.`;
    }
    if (error instanceof ProviderAbortError) {
      return "Provider request was cancelled.";
    }
    if (error instanceof ProviderError) {
      return `Provider request failed: ${error.message}`;
    }
    if (error instanceof Error) {
      return `Unexpected error: ${error.message}`;
    }
    return `Unexpected error: ${describeUnknown(error)}`;
  } catch {
    return "Unexpected error: unknown failure";
  }
}

function describeUnknown(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return String(value);
}
