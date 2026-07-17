import type { Logger } from "@agentforge/logger";
import type {
  LLMProviderRegistry,
  ToolRegistry,
} from "@agentforge/provider-sdk";
import type { PluginMetadata } from "./PluginMetadata.js";

export interface PluginContext {
  readonly frameworkVersion: string;
  readonly instanceName: string;
  readonly configuration: unknown;
  readonly logger: Logger;
  readonly llmProviders: LLMProviderRegistry;
  readonly tools: ToolRegistry;
}

export interface Plugin {
  readonly metadata: PluginMetadata;

  initialize(context: PluginContext): Promise<void>;

  shutdown?(): Promise<void>;
}
