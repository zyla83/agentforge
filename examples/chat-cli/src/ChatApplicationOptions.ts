import type {
  AgentForge,
  AgentProfile,
  ConversationEngine,
  ConversationStore,
  ConversationStoreEntry,
} from "@agentforge/core";
import type { ToolDefinition } from "@agentforge/provider-sdk";
import type { ChatToolMode } from "./environment.js";
import type { ChatTtsMode } from "./environment.js";
import type { ChatSttMode } from "./environment.js";
import type { ChatSpeechInput } from "./stt/ChatSpeechInput.js";
import type { ChatSpeechOutput } from "./tts/ChatSpeechOutput.js";

export interface ChatApplicationToolOptions {
  readonly mode: ChatToolMode;
  readonly definitions: readonly Readonly<ToolDefinition>[];
}

export interface ChatApplicationTtsOptions {
  readonly mode: ChatTtsMode;
  readonly speech?: ChatSpeechOutput;
}

export type ChatApplicationSttOptions =
  | {
      readonly mode: "off";
    }
  | {
      readonly mode: Extract<ChatSttMode, "whisper">;
      readonly speech: ChatSpeechInput;
      readonly language: string;
      readonly defaultDurationSeconds: number;
    };

export interface ChatApplicationOptions {
  readonly agent: AgentForge;
  readonly engine: ConversationEngine;
  readonly profile: AgentProfile;
  readonly store: ConversationStore;
  readonly initialEntry: Readonly<ConversationStoreEntry>;
  readonly dataDirectory: string;
  readonly timeoutMs: number;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly errorOutput: NodeJS.WritableStream;
  readonly tools: Readonly<ChatApplicationToolOptions>;
  readonly tts: Readonly<ChatApplicationTtsOptions>;
  readonly stt?: Readonly<ChatApplicationSttOptions>;
}
