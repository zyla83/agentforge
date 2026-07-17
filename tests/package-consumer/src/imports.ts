import { loadConfig } from "@agentforge/config";
import {
  AgentForge,
  type ConversationEngine,
  type ConversationEngineObservabilityOptions,
  type ToolExecutionObserverEvent,
  type ToolExecutionRedactor,
  createAgentProfile,
  createConversation,
} from "@agentforge/core";
import { registerExampleTools } from "@agentforge/example-tools";
import { type Logger, createLogger } from "@agentforge/logger";
import { OllamaClient } from "@agentforge/ollama-client";
import type { Plugin } from "@agentforge/plugin-sdk";
import { MockLLMProvider } from "@agentforge/provider-mock";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  type LLMGenerationRequest,
  LLMMessageRole,
  type LLMProvider,
  ProviderRequestError,
  type ToolDefinition,
  createToolDefinition,
} from "@agentforge/provider-sdk";
import { AgentForgeError } from "@agentforge/shared";
import {
  FilesystemConversationStore,
  createFilesystemConversationStore,
} from "@agentforge/storage-filesystem";

interface PublicTypeImports {
  readonly conversationEngine: ConversationEngine;
  readonly generationRequest: LLMGenerationRequest;
  readonly logger: Logger;
  readonly observability: ConversationEngineObservabilityOptions;
  readonly plugin: Plugin;
  readonly provider: LLMProvider;
  readonly toolEvent: ToolExecutionObserverEvent;
  readonly toolRedactor: ToolExecutionRedactor;
  readonly tool: ToolDefinition;
}

const publicTypeImports = undefined as unknown as PublicTypeImports;

void [
  loadConfig,
  AgentForge,
  createAgentProfile,
  createConversation,
  registerExampleTools,
  createLogger,
  OllamaClient,
  MockLLMProvider,
  OllamaLLMProvider,
  LLMMessageRole,
  ProviderRequestError,
  createToolDefinition,
  AgentForgeError,
  FilesystemConversationStore,
  createFilesystemConversationStore,
  publicTypeImports,
];
