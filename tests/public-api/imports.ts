import {
  AgentForge,
  type ConversationEngine,
  createAgentProfile,
  createConversation,
} from "@agentforge/core";
import type {
  ConversationEngineObservabilityOptions,
  ToolExecutionObserverEvent,
  ToolExecutionRedactor,
} from "@agentforge/core";
import { registerExampleTools } from "@agentforge/example-tools";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import { LLMMessageRole, createToolDefinition } from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMProvider,
  ToolDefinition,
} from "@agentforge/provider-sdk";
import { createFilesystemConversationStore } from "@agentforge/storage-filesystem";

const agent = new AgentForge();
const profile = createAgentProfile({
  id: "public-api-profile",
  systemPrompt: "Use documented public APIs.",
  model: "model",
});
const conversation = createConversation({ id: "public-api-conversation" });
const engine: ConversationEngine = agent.createConversationEngine({ profile });
const store = createFilesystemConversationStore({ directory: "./data" });
const provider: LLMProvider = new OllamaLLMProvider();
const tool: Readonly<ToolDefinition> = createToolDefinition({
  name: "example",
  description: "Exercise the public tool contract.",
  inputSchema: { type: "object", additionalProperties: false },
});
const redactor: ToolExecutionRedactor = {
  redactArguments: () => ({}),
};
const observability: ConversationEngineObservabilityOptions = {
  toolExecution: (_event: Readonly<ToolExecutionObserverEvent>) => undefined,
  redactor,
};
const request: LLMGenerationRequest = {
  model: "model",
  messages: [{ role: LLMMessageRole.User, content: "Hello" }],
};

registerExampleTools(agent);
void [conversation, engine, store, provider, tool, observability, request];
