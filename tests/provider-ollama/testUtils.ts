import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaClient,
  OllamaRequestOptions,
  OllamaVersion,
} from "@agentforge/ollama-client";

export const defaultChatResponse: OllamaChatResponse = {
  model: "ollama-model",
  message: { role: "assistant", content: "Ollama response" },
  done: true,
  doneReason: "stop",
};

export class FakeOllamaClient {
  readonly versionCalls: (OllamaRequestOptions | undefined)[] = [];
  readonly chatCalls: {
    request: OllamaChatRequest;
    options: OllamaRequestOptions | undefined;
  }[] = [];
  versionResult: OllamaVersion = { version: "0.12.6" };
  chatResult: OllamaChatResponse = defaultChatResponse;
  versionError: unknown;
  chatError: unknown;

  async getVersion(options?: OllamaRequestOptions): Promise<OllamaVersion> {
    this.versionCalls.push(options);
    if (this.versionError !== undefined) throw this.versionError;
    return this.versionResult;
  }

  async chat(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): Promise<OllamaChatResponse> {
    this.chatCalls.push({ request, options });
    if (this.chatError !== undefined) throw this.chatError;
    return this.chatResult;
  }
}

export function asOllamaClient(client: FakeOllamaClient): OllamaClient {
  return client as unknown as OllamaClient;
}
