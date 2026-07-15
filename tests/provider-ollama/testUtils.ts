import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaChatStreamChunk,
  OllamaClient,
  OllamaModel,
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
  readonly modelCalls: (OllamaRequestOptions | undefined)[] = [];
  readonly streamCalls: {
    request: OllamaChatRequest;
    options: OllamaRequestOptions | undefined;
  }[] = [];
  versionResult: OllamaVersion = { version: "0.12.6" };
  modelResult: readonly OllamaModel[] = [];
  chatResult: OllamaChatResponse = defaultChatResponse;
  streamResult: readonly OllamaChatStreamChunk[] = [
    {
      model: "ollama-model",
      message: { role: "assistant", content: "Ollama response" },
      done: true,
      doneReason: "stop",
    },
  ];
  versionError: unknown;
  modelError: unknown;
  chatError: unknown;
  streamError: unknown;
  baseUrlResult: unknown;
  baseUrlError: unknown;

  async getVersion(options?: OllamaRequestOptions): Promise<OllamaVersion> {
    this.versionCalls.push(options);
    if (this.versionError !== undefined) throw this.versionError;
    return this.versionResult;
  }

  async listModels(
    options?: OllamaRequestOptions,
  ): Promise<readonly OllamaModel[]> {
    this.modelCalls.push(options);
    if (this.modelError !== undefined) throw this.modelError;
    return this.modelResult;
  }

  async chat(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): Promise<OllamaChatResponse> {
    this.chatCalls.push({ request, options });
    if (this.chatError !== undefined) throw this.chatError;
    return this.chatResult;
  }

  async *chatStream(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions,
  ): AsyncIterable<OllamaChatStreamChunk> {
    this.streamCalls.push({ request, options });
    for (const chunk of this.streamResult) yield chunk;
    if (this.streamError !== undefined) throw this.streamError;
  }

  getBaseUrl(): string {
    if (this.baseUrlError !== undefined) throw this.baseUrlError;
    return this.baseUrlResult as string;
  }
}

export function asOllamaClient(client: FakeOllamaClient): OllamaClient {
  return client as unknown as OllamaClient;
}
