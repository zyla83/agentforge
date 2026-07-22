import process from "node:process";
import {
  AgentForge,
  AgentForgeState,
  createConversation,
} from "@agentforge/core";
import { PiperClient } from "@agentforge/piper-client";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import { ProviderHealthStatus } from "@agentforge/provider-sdk";
import type { ProviderHealth } from "@agentforge/provider-sdk";
import {
  FilesystemSpotifyCredentialStore,
  SpotifyAuthorizationSession,
  SpotifyClient,
} from "@agentforge/spotify-client";
import { createFilesystemConversationStore } from "@agentforge/storage-filesystem";
import { ChatApplication } from "./ChatApplication.js";
import {
  createChatConversationEngine,
  createChatToolOptions,
  registerConfiguredChatTools,
} from "./chatTools.js";
import { createChatProfile } from "./createChatProfile.js";
import type { ChatSpotifyEnvironment } from "./environment.js";
import { loadChatEnvironment } from "./environment.js";
import { formatChatError } from "./formatChatError.js";
import { PiperSpeechOutput } from "./tts/PiperSpeechOutput.js";

async function main(): Promise<void> {
  const environment = loadChatEnvironment();
  const provider = new OllamaLLMProvider({
    clientOptions: { baseUrl: environment.baseUrl },
    healthCheck: { model: environment.model },
  });
  const agent = new AgentForge({ instanceName: "interactive-chat" });
  agent.registerLLMProvider(provider, { default: true });
  const spotify =
    environment.spotify === undefined
      ? undefined
      : createSpotifyDependencies(environment.spotify);
  const tools = createChatToolOptions(environment.toolMode, spotify);
  registerConfiguredChatTools(agent, tools, spotify);
  const tts = createChatTts(environment);

  try {
    await agent.start();
    const health = await provider.checkHealth({
      timeoutMs: environment.timeoutMs,
    });
    assertHealthyOllama(health, environment.model);
    if (spotify !== undefined) {
      await ensureSpotifyAuthorization(spotify.session);
      console.log("Spotify authorization ready.");
    }

    const profile = createChatProfile(environment, provider.metadata.name);
    const engine = createChatConversationEngine(agent, profile, tools);
    const store = createFilesystemConversationStore({
      directory: environment.dataDirectory,
    });
    const initialEntry = await store.save(createConversation());
    const application = new ChatApplication({
      agent,
      engine,
      profile,
      store,
      initialEntry,
      dataDirectory: environment.dataDirectory,
      timeoutMs: environment.timeoutMs,
      input: process.stdin,
      output: process.stdout,
      errorOutput: process.stderr,
      tools,
      tts,
    });
    await application.run();
  } finally {
    if (agent.getState() === AgentForgeState.Running) {
      await agent.stop();
    }
  }
}

function createChatTts(
  environment: Readonly<ReturnType<typeof loadChatEnvironment>>,
): {
  readonly mode: "off" | "piper";
  readonly speech?: PiperSpeechOutput;
} {
  if (environment.tts.mode === "off") return Object.freeze({ mode: "off" });
  const configuration = environment.tts.piper;
  if (configuration === undefined) {
    throw new Error("Piper speech output is not configured.");
  }
  const client = new PiperClient({
    executable: configuration.executable,
    model: configuration.model,
    ...(configuration.config === undefined
      ? {}
      : { config: configuration.config }),
  });
  return Object.freeze({
    mode: "piper" as const,
    speech: new PiperSpeechOutput(client, environment.timeoutMs),
  });
}

function createSpotifyDependencies(
  configuration: Readonly<ChatSpotifyEnvironment>,
): {
  readonly client: SpotifyClient;
  readonly session: SpotifyAuthorizationSession;
} {
  const store = new FilesystemSpotifyCredentialStore({
    directory: configuration.dataDirectory,
  });
  const session = new SpotifyAuthorizationSession({
    clientId: configuration.clientId,
    redirectUri: configuration.redirectUri,
    credentialStore: store,
    onAuthorizationUrl: (url) => {
      console.log("Open this Spotify authorization URL in your browser:");
      console.log(url);
    },
  });
  return Object.freeze({
    session,
    client: new SpotifyClient({ accessTokenSource: session }),
  });
}

async function ensureSpotifyAuthorization(
  session: SpotifyAuthorizationSession,
): Promise<void> {
  const controller = new AbortController();
  const onSigint = (): void =>
    controller.abort(new Error("Terminal interrupt requested"));
  process.once("SIGINT", onSigint);
  try {
    await session.getAccessToken({ signal: controller.signal });
  } finally {
    process.off("SIGINT", onSigint);
  }
}

function assertHealthyOllama(health: ProviderHealth, model: string): void {
  if (health.status === ProviderHealthStatus.Healthy) return;
  if (health.details?.modelAvailable === false) {
    throw new Error(
      `The configured Ollama model "${model}" is not installed.\nInstall the model with:\n  ollama pull ${model}`,
    );
  }
  throw new Error(health.message ?? "Ollama is not healthy.");
}

main().catch((error: unknown) => {
  console.error(formatChatError(error));
  process.exitCode = 1;
});
