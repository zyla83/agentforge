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
import {
  PiperAbortError,
  PiperClient,
  PiperConfigurationError,
  PiperOutputError,
  PiperProcessError,
  PiperRequestError,
  PiperResourceError,
  PiperTimeoutError,
  PiperTransportError,
} from "@agentforge/piper-client";
import type {
  PiperClientOptions,
  PiperSynthesisOptions,
  PiperSynthesisRequest,
  PiperSynthesisResult,
} from "@agentforge/piper-client";
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
  SPOTIFY_MODIFY_PLAYBACK_SCOPE,
  SPOTIFY_PLAYBACK_SCOPE,
  SPOTIFY_PLAYBACK_SCOPES,
  SpotifyAuthorizationSession,
  SpotifyClient,
} from "@agentforge/spotify-client";
import type {
  SpotifyAvailableDevice,
  SpotifyAvailableDevices,
  SpotifyPlaylistSearchItem,
  SpotifyPlaylistSearchResult,
  SpotifySearchRequestOptions,
  SpotifyStartPlaybackRequest,
  SpotifyStartPlaybackResult,
  SpotifyTrackSearchItem,
  SpotifyTrackSearchResult,
} from "@agentforge/spotify-client";
import {
  FilesystemConversationStore,
  createFilesystemConversationStore,
} from "@agentforge/storage-filesystem";
import {
  WhisperAbortError,
  WhisperClient,
  WhisperConfigurationError,
  WhisperOutputError,
  WhisperProcessError,
  WhisperRequestError,
  WhisperResourceError,
  WhisperTimeoutError,
  WhisperTransportError,
} from "@agentforge/whisper-client";
import type {
  WhisperClientOptions,
  WhisperTranscriptionOptions,
  WhisperTranscriptionRequest,
  WhisperTranscriptionResult,
} from "@agentforge/whisper-client";

interface PublicTypeImports {
  readonly conversationEngine: ConversationEngine;
  readonly generationRequest: LLMGenerationRequest;
  readonly logger: Logger;
  readonly observability: ConversationEngineObservabilityOptions;
  readonly plugin: Plugin;
  readonly piperClientOptions: PiperClientOptions;
  readonly piperSynthesisOptions: PiperSynthesisOptions;
  readonly piperSynthesisRequest: PiperSynthesisRequest;
  readonly piperSynthesisResult: PiperSynthesisResult;
  readonly provider: LLMProvider;
  readonly spotifyAvailableDevice: SpotifyAvailableDevice;
  readonly spotifyAvailableDevices: SpotifyAvailableDevices;
  readonly spotifyPlaylistSearchItem: SpotifyPlaylistSearchItem;
  readonly spotifyPlaylistSearchResult: SpotifyPlaylistSearchResult;
  readonly spotifySearchOptions: SpotifySearchRequestOptions;
  readonly spotifyStartPlaybackRequest: SpotifyStartPlaybackRequest;
  readonly spotifyStartPlaybackResult: SpotifyStartPlaybackResult;
  readonly spotifyTrackSearchItem: SpotifyTrackSearchItem;
  readonly spotifyTrackSearchResult: SpotifyTrackSearchResult;
  readonly toolEvent: ToolExecutionObserverEvent;
  readonly toolRedactor: ToolExecutionRedactor;
  readonly tool: ToolDefinition;
  readonly whisperClientOptions: WhisperClientOptions;
  readonly whisperTranscriptionOptions: WhisperTranscriptionOptions;
  readonly whisperTranscriptionRequest: WhisperTranscriptionRequest;
  readonly whisperTranscriptionResult: WhisperTranscriptionResult;
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
  PiperClient,
  PiperAbortError,
  PiperConfigurationError,
  PiperOutputError,
  PiperProcessError,
  PiperRequestError,
  PiperResourceError,
  PiperTimeoutError,
  PiperTransportError,
  MockLLMProvider,
  OllamaLLMProvider,
  LLMMessageRole,
  ProviderRequestError,
  createToolDefinition,
  AgentForgeError,
  SpotifyAuthorizationSession,
  SpotifyClient,
  SPOTIFY_PLAYBACK_SCOPE,
  SPOTIFY_MODIFY_PLAYBACK_SCOPE,
  SPOTIFY_PLAYBACK_SCOPES,
  FilesystemConversationStore,
  createFilesystemConversationStore,
  WhisperClient,
  WhisperAbortError,
  WhisperConfigurationError,
  WhisperOutputError,
  WhisperProcessError,
  WhisperRequestError,
  WhisperResourceError,
  WhisperTimeoutError,
  WhisperTransportError,
  publicTypeImports,
];
