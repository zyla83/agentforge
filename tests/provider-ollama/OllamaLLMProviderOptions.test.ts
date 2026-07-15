import type { FetchImplementation } from "@agentforge/ollama-client";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  ProviderHealthStatus,
  ProviderRequestError,
} from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

describe("OllamaLLMProvider options", () => {
  it("uses frozen default metadata", () => {
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(new FakeOllamaClient()),
    });
    expect(provider.metadata).toEqual({
      name: "ollama",
      version: "1.0.0",
      description: "Local Ollama large language model provider.",
    });
    expect(Object.isFrozen(provider.metadata)).toBe(true);
  });

  it("copies custom metadata", () => {
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(new FakeOllamaClient()),
      name: "local-ollama",
      version: "2.0.0",
      description: "Custom provider",
    });
    expect(provider.metadata).toEqual({
      name: "local-ollama",
      version: "2.0.0",
      description: "Custom provider",
    });
  });

  it("uses the exact injected compatible client", async () => {
    const client = new FakeOllamaClient();
    const provider = new OllamaLLMProvider({ client: asOllamaClient(client) });
    await provider.checkHealth();
    expect(client.versionCalls).toHaveLength(1);
  });

  it("constructs a real client from clientOptions", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ version: "1.2.3" })),
    );
    const provider = new OllamaLLMProvider({
      clientOptions: { fetch: fetch as FetchImplementation },
    });
    await expect(provider.checkHealth()).resolves.toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Ollama 1.2.3 is available.",
      details: {
        serverAvailable: true,
        version: "1.2.3",
        baseUrl: "http://localhost:11434",
      },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects client and clientOptions together", () => {
    expect(
      () =>
        new OllamaLLMProvider({
          client: asOllamaClient(new FakeOllamaClient()),
          clientOptions: {},
        }),
    ).toThrowError(
      expect.objectContaining({
        name: "ProviderRequestError",
        providerName: "ollama",
        message:
          'Provider "ollama" configuration is invalid: client and clientOptions cannot both be provided.',
      }),
    );
  });

  it.each([null, [], 42, "options"])(
    "rejects malformed runtime options %#",
    (options) => {
      expect(() => new OllamaLLMProvider(options as never)).toThrow(
        ProviderRequestError,
      );
    },
  );

  it.each([
    {},
    { listModels() {}, chat() {} },
    { getVersion() {}, chat() {} },
    { getVersion() {}, listModels() {} },
    null,
  ])("rejects malformed injected client %#", (client) => {
    expect(() => new OllamaLLMProvider({ client: client as never })).toThrow(
      ProviderRequestError,
    );
  });

  it("maps malformed clientOptions to provider configuration error", () => {
    expect(
      () =>
        new OllamaLLMProvider({
          clientOptions: { defaultTimeoutMs: 0 },
        }),
    ).toThrowError(
      expect.objectContaining({
        name: "ProviderRequestError",
        providerName: "ollama",
        cause: expect.anything(),
      }),
    );
  });

  it("does not mutate caller options", () => {
    const client = asOllamaClient(new FakeOllamaClient());
    const options = { client, name: "custom", version: "1.0.0" };
    const before = { ...options };
    new OllamaLLMProvider(options);
    expect(options).toEqual(before);
    expect(options.client).toBe(client);
  });

  it("accepts absent or empty health-check configuration", async () => {
    const client = new FakeOllamaClient();
    const withoutHealthCheck = new OllamaLLMProvider({
      client: asOllamaClient(client),
    });
    const withEmptyHealthCheck = new OllamaLLMProvider({
      client: asOllamaClient(client),
      healthCheck: {},
    });
    await withoutHealthCheck.checkHealth();
    await withEmptyHealthCheck.checkHealth();
    expect(client.modelCalls).toEqual([]);
  });

  it("preserves and snapshots the configured model", async () => {
    const client = new FakeOllamaClient();
    client.modelResult = [{ name: " model ", model: "other" }];
    const healthCheck = { model: " model " };
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
      healthCheck,
    });
    healthCheck.model = "changed";

    const health = await provider.checkHealth();

    expect(health.details).toMatchObject({
      requiredModel: " model ",
      modelAvailable: true,
    });
  });

  it.each([null, [], "health", 42])(
    "rejects malformed healthCheck %#",
    (healthCheck) => {
      expect(
        () => new OllamaLLMProvider({ healthCheck: healthCheck as never }),
      ).toThrow(ProviderRequestError);
    },
  );

  it.each([42, "", "   "])("rejects malformed health model %#", (model) => {
    expect(
      () => new OllamaLLMProvider({ healthCheck: { model: model as string } }),
    ).toThrowError(
      expect.objectContaining({
        message:
          'Provider "ollama" configuration is invalid: healthCheck.model must be a non-empty string.',
      }),
    );
  });

  it("performs no client calls during construction", () => {
    const client = new FakeOllamaClient();
    new OllamaLLMProvider({
      client: asOllamaClient(client),
      healthCheck: { model: "llama3.1:8b" },
    });
    expect(client.versionCalls).toEqual([]);
    expect(client.modelCalls).toEqual([]);
    expect(client.chatCalls).toEqual([]);
  });

  it("accepts a compatible client without getBaseUrl", () => {
    const client = {
      async getVersion() {
        return { version: "1.0.0" };
      },
      async listModels() {
        return [];
      },
      async chat() {
        return {
          model: "model",
          message: { role: "assistant" as const, content: "response" },
          done: true,
        };
      },
    };
    expect(
      () => new OllamaLLMProvider({ client: client as never }),
    ).not.toThrow();
  });

  it("ignores malformed optional getBaseUrl during construction", () => {
    const client = new FakeOllamaClient() as unknown as Record<string, unknown>;
    client.getBaseUrl = 42;
    expect(
      () => new OllamaLLMProvider({ client: client as never }),
    ).not.toThrow();
  });
});
