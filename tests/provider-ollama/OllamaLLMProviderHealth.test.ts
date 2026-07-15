import {
  type FetchImplementation,
  OllamaAbortError,
  OllamaConnectionError,
  OllamaHttpError,
  OllamaRequestError,
  OllamaResponseError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  LLMMessageRole,
  ProviderAbortError,
  ProviderHealthStatus,
  ProviderRequestError,
  ProviderTimeoutError,
} from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

const requiredModel = "llama3.1:8b";

function createProvider(
  client: FakeOllamaClient,
  model: string | null = requiredModel,
): OllamaLLMProvider {
  return new OllamaLLMProvider({
    client: asOllamaClient(client),
    ...(model === null ? {} : { healthCheck: { model } }),
  });
}

describe("OllamaLLMProvider server-only health", () => {
  it("calls only getVersion and returns frozen healthy details", async () => {
    const client = new FakeOllamaClient();
    client.versionResult = { version: "0.12.6" };
    client.baseUrlResult = "http://localhost:11434";

    const health = await createProvider(client, null).checkHealth();

    expect(client.versionCalls).toEqual([undefined]);
    expect(client.modelCalls).toEqual([]);
    expect(client.chatCalls).toEqual([]);
    expect(health).toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Ollama 0.12.6 is available.",
      details: {
        serverAvailable: true,
        version: "0.12.6",
        baseUrl: "http://localhost:11434",
      },
    });
    expect(Object.isFrozen(health)).toBe(true);
    expect(Object.isFrozen(health.details)).toBe(true);
  });

  it("includes a valid HTTPS base URL without rewriting it", async () => {
    const client = new FakeOllamaClient();
    client.baseUrlResult = "https://ollama.example.test/api-root";
    const health = await createProvider(client, null).checkHealth();
    expect(health.details?.baseUrl).toBe(
      "https://ollama.example.test/api-root",
    );
  });

  it("includes the normalized base URL from a real OllamaClient", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ version: "0.12.6" })),
    );
    const provider = new OllamaLLMProvider({
      clientOptions: {
        baseUrl: "http://127.0.0.1:11434/",
        fetch: fetch as FetchImplementation,
      },
    });
    const health = await provider.checkHealth();
    expect(health.details?.baseUrl).toBe("http://127.0.0.1:11434");
  });

  it("omits base URL when the client does not expose one", async () => {
    const client = {
      async getVersion() {
        return { version: "0.12.6" };
      },
      async listModels() {
        return [];
      },
      async chat() {
        throw new Error("unused");
      },
    };
    const health = await new OllamaLLMProvider({
      client: client as never,
    }).checkHealth();
    expect(health.details).toEqual({
      serverAvailable: true,
      version: "0.12.6",
    });
  });

  it.each([undefined, "", "   ", 42])(
    "ignores malformed optional base URL %#",
    async (baseUrlResult) => {
      const client = new FakeOllamaClient();
      client.baseUrlResult = baseUrlResult;
      const health = await createProvider(client, null).checkHealth();
      expect(health.details).not.toHaveProperty("baseUrl");
    },
  );

  it("ignores a throwing optional base URL getter", async () => {
    const client = new FakeOllamaClient();
    client.baseUrlError = new Error("do not expose");
    const health = await createProvider(client, null).checkHealth();
    expect(health.status).toBe(ProviderHealthStatus.Healthy);
    expect(health.details).not.toHaveProperty("baseUrl");
  });

  it.each([
    "not-a-valid-url",
    "file:///tmp/ollama",
    "http://user:secret@localhost:11434",
    "http://localhost:11434?token=secret",
    "http://localhost:11434#secret",
  ])("omits unsafe reported base URL %s", async (baseUrl) => {
    const client = new FakeOllamaClient();
    client.baseUrlResult = baseUrl;
    const health = await createProvider(client, null).checkHealth();
    expect(health.details).not.toHaveProperty("baseUrl");
  });
});

describe("OllamaLLMProvider model-aware health", () => {
  it.each([
    [[{ name: requiredModel, model: "other" }], "name"],
    [[{ name: "other", model: requiredModel }], "model"],
    [
      [
        { name: "first", model: "first" },
        { name: requiredModel, model: requiredModel },
        { name: "last", model: "last" },
      ],
      "ordered list",
    ],
  ])("returns healthy for an exact %s match", async (models) => {
    const client = new FakeOllamaClient();
    client.modelResult = models;
    client.baseUrlResult = "http://localhost:11434";

    const health = await createProvider(client).checkHealth();

    expect(health.status).toBe(ProviderHealthStatus.Healthy);
    expect(health.message).toBe(
      'Ollama 0.12.6 is available and model "llama3.1:8b" is installed.',
    );
    expect(health.details).toEqual({
      serverAvailable: true,
      version: "0.12.6",
      requiredModel,
      modelAvailable: true,
      installedModelCount: models.length,
      baseUrl: "http://localhost:11434",
    });
  });

  it.each([
    [[], "empty list"],
    [[{ name: "other", model: "other" }], "different model"],
    [[{ name: "Llama3.1:8b", model: "Llama3.1:8b" }], "case mismatch"],
    [[{ name: "llama3.1", model: "llama3.1" }], "tag mismatch"],
  ])("returns degraded for %s", async (models) => {
    const client = new FakeOllamaClient();
    client.modelResult = models;

    const health = await createProvider(client).checkHealth();

    expect(health).toEqual({
      status: ProviderHealthStatus.Degraded,
      message: 'Ollama is available, but model "llama3.1:8b" is not installed.',
      details: {
        serverAvailable: true,
        version: "0.12.6",
        requiredModel,
        modelAvailable: false,
        installedModelCount: models.length,
      },
    });
  });

  it("passes the same mapped request options to both client calls", async () => {
    const client = new FakeOllamaClient();
    client.modelResult = [{ name: requiredModel, model: requiredModel }];
    const signal = new AbortController().signal;

    await createProvider(client).checkHealth({ signal, timeoutMs: 500 });

    expect(client.versionCalls[0]).toEqual({ signal, timeoutMs: 500 });
    expect(client.modelCalls[0]).toBe(client.versionCalls[0]);
    expect(client.modelCalls[0]?.signal).toBe(signal);
  });

  it.each([
    [undefined, undefined],
    [{ signal: new AbortController().signal }, "signal"],
    [{ timeoutMs: 500 }, "timeout"],
  ])("maps request options %#", async (options) => {
    const client = new FakeOllamaClient();
    client.modelResult = [{ name: requiredModel, model: requiredModel }];
    await createProvider(client).checkHealth(options);
    expect(client.versionCalls).toHaveLength(1);
    expect(client.modelCalls).toHaveLength(1);
  });
});

describe("OllamaLLMProvider health failures", () => {
  const unavailableErrors = [
    new OllamaConnectionError("http://localhost:11434"),
    new OllamaHttpError("/api/version", 500, "Error", "private server text"),
    new OllamaResponseError("/api/version", ["private response detail"]),
  ];

  it.each(["version", "models"])(
    "returns unavailable for expected %s failures",
    async (source) => {
      for (const error of unavailableErrors) {
        const client = new FakeOllamaClient();
        client.baseUrlResult = "http://localhost:11434";
        if (source === "version") client.versionError = error;
        else client.modelError = error;

        const health = await createProvider(client).checkHealth();

        expect(health).toEqual({
          status: ProviderHealthStatus.Unavailable,
          message: "Ollama is unavailable.",
          details: {
            serverAvailable: false,
            requiredModel,
            baseUrl: "http://localhost:11434",
          },
        });
        expect(health.details).not.toHaveProperty("error");
        expect(health.details).not.toHaveProperty("client");
        expect(health.details).not.toHaveProperty("models");
      }
    },
  );

  it.each(["version", "models"])(
    "maps %s abort and timeout errors",
    async (source) => {
      for (const [error, expected] of [
        [new OllamaAbortError("/api/version"), ProviderAbortError],
        [new OllamaTimeoutError("/api/version", 250), ProviderTimeoutError],
      ] as const) {
        const client = new FakeOllamaClient();
        if (source === "version") client.versionError = error;
        else client.modelError = error;
        await expect(
          createProvider(client).checkHealth(),
        ).rejects.toBeInstanceOf(expected);
      }
    },
  );

  it.each(["version", "models"])(
    "maps %s request and unexpected errors",
    async (source) => {
      for (const error of [
        new OllamaRequestError(["invalid"]),
        new Error("unexpected"),
      ]) {
        const client = new FakeOllamaClient();
        if (source === "version") client.versionError = error;
        else client.modelError = error;
        await expect(createProvider(client).checkHealth()).rejects.toEqual(
          expect.objectContaining({
            name: "ProviderRequestError",
            providerName: "ollama",
            cause: error,
          }),
        );
      }
    },
  );

  it("prevents both calls for invalid or aborted request options", async () => {
    for (const options of [
      { timeoutMs: 0 },
      { signal: AbortSignal.abort("cancelled") },
    ]) {
      const client = new FakeOllamaClient();
      await expect(
        createProvider(client).checkHealth(options),
      ).rejects.toBeInstanceOf(ProviderRequestError);
      expect(client.versionCalls).toEqual([]);
      expect(client.modelCalls).toEqual([]);
    }
  });
});

describe("OllamaLLMProvider health configuration independence", () => {
  it("does not force generation to use the health model", async () => {
    const client = new FakeOllamaClient();
    await createProvider(client).generate({
      model: "another-model",
      messages: [{ role: LLMMessageRole.User, content: "Hello" }],
    });
    expect(client.chatCalls[0]?.request.model).toBe("another-model");
    expect(client.versionCalls).toEqual([]);
    expect(client.modelCalls).toEqual([]);
  });
});
