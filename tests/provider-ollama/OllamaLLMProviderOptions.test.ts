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

  it.each([{}, { getVersion() {} }, { chat() {} }, null])(
    "rejects malformed injected client %#",
    (client) => {
      expect(() => new OllamaLLMProvider({ client: client as never })).toThrow(
        ProviderRequestError,
      );
    },
  );

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
});
