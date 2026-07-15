import {
  OllamaAbortError,
  OllamaConnectionError,
  OllamaHttpError,
  OllamaRequestError,
  OllamaResponseError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  ProviderAbortError,
  ProviderHealthStatus,
  ProviderRequestError,
  ProviderTimeoutError,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

describe("OllamaLLMProvider health", () => {
  it("returns healthy status with the Ollama version", async () => {
    const client = new FakeOllamaClient();
    client.versionResult = { version: "0.12.6" };
    const health = await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).checkHealth();
    expect(health).toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Ollama 0.12.6 is available.",
    });
    expect(Object.isFrozen(health)).toBe(true);
    expect(client.chatCalls).toEqual([]);
  });

  it("passes signal and timeout to getVersion", async () => {
    const client = new FakeOllamaClient();
    const signal = new AbortController().signal;
    await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).checkHealth({ signal, timeoutMs: 500 });
    expect(client.versionCalls).toEqual([{ signal, timeoutMs: 500 }]);
  });

  it.each([
    new OllamaConnectionError("http://localhost:11434"),
    new OllamaHttpError("/api/version", 500, "Error"),
    new OllamaResponseError("/api/version", ["invalid"]),
  ])("returns unavailable health for %s", async (error) => {
    const client = new FakeOllamaClient();
    client.versionError = error;
    const health = await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).checkHealth();
    expect(health).toEqual({
      status: ProviderHealthStatus.Unavailable,
      message: "Ollama is unavailable.",
    });
    expect(client.chatCalls).toEqual([]);
  });

  it("maps abort to ProviderAbortError", async () => {
    const client = new FakeOllamaClient();
    client.versionError = new OllamaAbortError("/api/version");
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).checkHealth(),
    ).rejects.toBeInstanceOf(ProviderAbortError);
  });

  it("maps timeout to ProviderTimeoutError", async () => {
    const client = new FakeOllamaClient();
    client.versionError = new OllamaTimeoutError("/api/version", 250);
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).checkHealth(),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderTimeoutError",
        timeoutMs: 250,
      }),
    );
  });

  it("maps client request misuse to ProviderRequestError", async () => {
    const client = new FakeOllamaClient();
    client.versionError = new OllamaRequestError(["invalid"]);
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).checkHealth(),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("rejects invalid timeout before calling the client", async () => {
    const client = new FakeOllamaClient();
    await expect(
      new OllamaLLMProvider({
        client: asOllamaClient(client),
      }).checkHealth({ timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(client.versionCalls).toEqual([]);
  });

  it.each([null, [], "options"])(
    "rejects malformed runtime request options %# before calling the client",
    async (options) => {
      const client = new FakeOllamaClient();
      await expect(
        new OllamaLLMProvider({
          client: asOllamaClient(client),
        }).checkHealth(options as never),
      ).rejects.toBeInstanceOf(ProviderRequestError);
      expect(client.versionCalls).toEqual([]);
    },
  );

  it("rejects a malformed runtime signal before calling the client", async () => {
    const client = new FakeOllamaClient();
    await expect(
      new OllamaLLMProvider({
        client: asOllamaClient(client),
      }).checkHealth({ signal: 42 as unknown as AbortSignal }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(client.versionCalls).toEqual([]);
  });

  it("rejects pre-aborted health checks before calling the client", async () => {
    const client = new FakeOllamaClient();
    const controller = new AbortController();
    controller.abort("cancelled");
    await expect(
      new OllamaLLMProvider({
        client: asOllamaClient(client),
      }).checkHealth({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(ProviderAbortError);
    expect(client.versionCalls).toEqual([]);
  });

  it("maps unknown failures to ProviderRequestError with cause", async () => {
    const client = new FakeOllamaClient();
    const error = new Error("unexpected");
    client.versionError = error;
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).checkHealth(),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderRequestError",
        providerName: "ollama",
        cause: error,
      }),
    );
  });
});
