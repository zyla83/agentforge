import type {
  AgentForge,
  AgentProfile,
  ConversationEngine,
} from "@agentforge/core";
import {
  exampleToolDefinitions,
  registerExampleTools,
} from "@agentforge/example-tools";
import type { ToolDefinition } from "@agentforge/provider-sdk";
import type { ChatApplicationToolOptions } from "./ChatApplicationOptions.js";
import type { ChatToolMode } from "./environment.js";

export function createChatToolOptions(
  mode: ChatToolMode,
): Readonly<ChatApplicationToolOptions> {
  return Object.freeze({
    mode,
    definitions:
      mode === "example"
        ? exampleToolDefinitions
        : Object.freeze([] as Readonly<ToolDefinition>[]),
  });
}

export function registerConfiguredChatTools(
  agent: AgentForge,
  tools: Readonly<ChatApplicationToolOptions>,
): void {
  if (tools.mode === "example") registerExampleTools(agent);
}

export function createChatConversationEngine(
  agent: AgentForge,
  profile: AgentProfile,
  tools: Readonly<ChatApplicationToolOptions>,
): ConversationEngine {
  return agent.createConversationEngine({
    profile,
    toolExecution: { enabled: tools.mode === "example" },
  });
}
