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
  LLMMessageRole,
  ProviderAbortError,
  ProviderRequestError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

const request = {
  model: "model",
  messages: [{ role: LLMMessageRole.User, content: "hello" }],
};

async function generateWithError(error: unknown): Promise<unknown> {
  const client = new FakeOllamaClient();
  client.chatError = error;
  return new OllamaLLMProvider({
    client: asOllamaClient(client),
  }).generate(request);
}

describe("OllamaLLMProvider generation errors", () => {
  it("maps abort errors and preserves the transport cause", async () => {
    const transportError = new OllamaAbortError("/api/chat");
    await expect(generateWithError(transportError)).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderAbortError",
        providerName: "ollama",
        cause: transportError,
      }),
    );
    await expect(generateWithError(transportError)).rejects.toBeInstanceOf(
      ProviderAbortError,
    );
  });

  it("maps timeout errors and preserves timeout", async () => {
    const transportError = new OllamaTimeoutError("/api/chat", 1234);
    await expect(generateWithError(transportError)).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderTimeoutError",
        providerName: "ollama",
        timeoutMs: 1234,
        cause: transportError,
      }),
    );
    await expect(generateWithError(transportError)).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });

  it("maps connection failures to unavailable errors", async () => {
    const error = new OllamaConnectionError("http://localhost:11434");
    await expect(generateWithError(error)).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderUnavailableError",
        providerName: "ollama",
        message: 'Provider "ollama" cannot connect to Ollama.',
        cause: error,
      }),
    );
    await expect(generateWithError(error)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps a 404 and preserves a safe missing-model message", async () => {
    const error = new OllamaHttpError(
      "/api/chat",
      404,
      "Not Found",
      "model not found",
    );
    await expect(generateWithError(error)).rejects.toMatchObject({
      name: "ProviderRequestError",
      providerName: "ollama",
      message:
        'Provider "ollama" could not use the requested model: model not found.',
      cause: error,
    });
  });

  it("recognizes a missing-model server message on another status", async () => {
    const error = new OllamaHttpError(
      "/api/chat",
      400,
      "Bad Request",
      "requested model does not exist",
    );
    await expect(generateWithError(error)).rejects.toMatchObject({
      message:
        'Provider "ollama" could not use the requested model: requested model does not exist.',
    });
  });

  it("omits server messages longer than 500 characters", async () => {
    const error = new OllamaHttpError(
      "/api/chat",
      404,
      "Not Found",
      `model not found ${"x".repeat(500)}`,
    );
    await expect(generateWithError(error)).rejects.toMatchObject({
      message: 'Provider "ollama" could not use the requested model.',
    });
  });

  it("maps generic HTTP failures without leaking server content", async () => {
    const error = new OllamaHttpError(
      "/api/chat",
      500,
      "Error",
      "internal details",
    );
    await expect(generateWithError(error)).rejects.toMatchObject({
      name: "ProviderRequestError",
      providerName: "ollama",
      message: 'Provider "ollama" request failed with HTTP 500.',
      cause: error,
    });
  });

  it.each([
    [new OllamaRequestError(["invalid"]), "produced an invalid Ollama request"],
    [
      new OllamaResponseError("/api/chat", ["invalid"]),
      "received an invalid response from Ollama",
    ],
    [new Error("unexpected"), "request failed unexpectedly"],
  ])("maps %s to ProviderRequestError", async (error, message) => {
    await expect(generateWithError(error)).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderRequestError",
        providerName: "ollama",
        message: expect.stringContaining(message),
        cause: error,
      }),
    );
    await expect(generateWithError(error)).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });
});
