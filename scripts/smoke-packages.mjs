const packageChecks = [
  ["@agentforge/config", "../packages/config/dist/index.js", ["loadConfig"]],
  [
    "@agentforge/core",
    "../packages/core/dist/index.js",
    [
      "AgentForge",
      "ConversationEngine",
      "createAgentProfile",
      "createConversation",
    ],
  ],
  [
    "@agentforge/example-tools",
    "../packages/example-tools/dist/index.js",
    ["registerExampleTools"],
  ],
  ["@agentforge/logger", "../packages/logger/dist/index.js", ["createLogger"]],
  [
    "@agentforge/ollama-client",
    "../packages/ollama-client/dist/index.js",
    ["OllamaClient"],
  ],
  ["@agentforge/plugin-sdk", "../packages/plugin-sdk/dist/index.js", []],
  [
    "@agentforge/provider-mock",
    "../packages/provider-mock/dist/index.js",
    ["MockLLMProvider"],
  ],
  [
    "@agentforge/provider-ollama",
    "../packages/provider-ollama/dist/index.js",
    ["OllamaLLMProvider"],
  ],
  [
    "@agentforge/provider-sdk",
    "../packages/provider-sdk/dist/index.js",
    ["ProviderRequestError", "ProviderResponseError", "createToolDefinition"],
  ],
  [
    "@agentforge/shared",
    "../packages/shared/dist/index.js",
    ["AgentForgeError"],
  ],
  [
    "@agentforge/storage-filesystem",
    "../packages/storage-filesystem/dist/index.js",
    ["FilesystemConversationStore", "createFilesystemConversationStore"],
  ],
];

for (const [packageName, entryPoint, expectedExports] of packageChecks) {
  const packageModule = await import(new URL(entryPoint, import.meta.url));
  for (const exportName of expectedExports) {
    if (!(exportName in packageModule)) {
      throw new Error(
        `Package "${packageName}" does not export "${exportName}".`,
      );
    }
  }
}

console.log(
  `Built package smoke check passed for ${packageChecks.length} packages.`,
);
