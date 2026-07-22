import * as config from "@agentforge/config";
import * as core from "@agentforge/core";
import * as exampleTools from "@agentforge/example-tools";
import * as logger from "@agentforge/logger";
import * as ollamaClient from "@agentforge/ollama-client";
import * as piperClient from "@agentforge/piper-client";
import "@agentforge/plugin-sdk";
import * as providerMock from "@agentforge/provider-mock";
import * as providerOllama from "@agentforge/provider-ollama";
import * as providerSdk from "@agentforge/provider-sdk";
import * as shared from "@agentforge/shared";
import * as spotifyClient from "@agentforge/spotify-client";
import * as storageFilesystem from "@agentforge/storage-filesystem";

const packageChecks = [
  ["@agentforge/config", config, ["loadConfig"]],
  [
    "@agentforge/core",
    core,
    [
      "AgentForge",
      "ConversationEngine",
      "createAgentProfile",
      "createConversation",
    ],
  ],
  ["@agentforge/example-tools", exampleTools, ["registerExampleTools"]],
  ["@agentforge/logger", logger, ["createLogger"]],
  ["@agentforge/ollama-client", ollamaClient, ["OllamaClient"]],
  [
    "@agentforge/piper-client",
    piperClient,
    [
      "PiperClient",
      "PiperConfigurationError",
      "PiperRequestError",
      "PiperResourceError",
      "PiperAbortError",
      "PiperTimeoutError",
      "PiperTransportError",
      "PiperProcessError",
      "PiperOutputError",
    ],
  ],
  ["@agentforge/plugin-sdk", undefined, []],
  ["@agentforge/provider-mock", providerMock, ["MockLLMProvider"]],
  ["@agentforge/provider-ollama", providerOllama, ["OllamaLLMProvider"]],
  [
    "@agentforge/provider-sdk",
    providerSdk,
    ["ProviderRequestError", "ProviderResponseError", "createToolDefinition"],
  ],
  ["@agentforge/shared", shared, ["AgentForgeError"]],
  [
    "@agentforge/spotify-client",
    spotifyClient,
    ["SpotifyAuthorizationSession", "SpotifyClient"],
  ],
  [
    "@agentforge/storage-filesystem",
    storageFilesystem,
    ["FilesystemConversationStore", "createFilesystemConversationStore"],
  ],
];

for (const [packageName, packageModule, expectedExports] of packageChecks) {
  for (const exportName of expectedExports) {
    if (!(exportName in packageModule)) {
      throw new Error(
        `Package "${packageName}" does not export "${exportName}".`,
      );
    }
  }
}

for (const methodName of [
  "searchTracks",
  "searchPlaylists",
  "getAvailableDevices",
  "startPlayback",
]) {
  if (typeof spotifyClient.SpotifyClient.prototype[methodName] !== "function") {
    throw new Error(
      `Package "@agentforge/spotify-client" does not expose SpotifyClient.${methodName}().`,
    );
  }
}

if (
  spotifyClient.SPOTIFY_PLAYBACK_SCOPE !== "user-read-playback-state" ||
  spotifyClient.SPOTIFY_MODIFY_PLAYBACK_SCOPE !==
    "user-modify-playback-state" ||
  !Object.isFrozen(spotifyClient.SPOTIFY_PLAYBACK_SCOPES) ||
  spotifyClient.SPOTIFY_PLAYBACK_SCOPES.join(" ") !==
    "user-read-playback-state user-modify-playback-state"
) {
  throw new Error(
    'Package "@agentforge/spotify-client" does not expose canonical playback scopes.',
  );
}

console.log(
  `Public package consumer smoke check passed for ${packageChecks.length} packages.`,
);
