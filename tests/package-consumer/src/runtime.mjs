import * as config from "@agentforge/config";
import * as core from "@agentforge/core";
import * as exampleTools from "@agentforge/example-tools";
import * as logger from "@agentforge/logger";
import * as ollamaClient from "@agentforge/ollama-client";
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

console.log(
  `Public package consumer smoke check passed for ${packageChecks.length} packages.`,
);
