import {
  type FetchImplementation,
  OllamaClient,
  OllamaConnectionError,
  OllamaHttpError,
} from "@agentforge/ollama-client";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, validChatResponse } from "./testUtils.js";

describe("OllamaClient HTTP errors", () => {
  it("exposes structured JSON server errors", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        { error: "model not found", secret: "do not expose" },
        { status: 404, statusText: "Not Found" },
      ),
    );

    const promise = new OllamaClient({
      fetch: fetch as FetchImplementation,
    }).chat({
      model: "missing",
      messages: [{ role: "user", content: "Hello" }],
    });

    await expect(promise).rejects.toMatchObject({
      name: "OllamaHttpError",
      status: 404,
      statusText: "Not Found",
      endpoint: "/api/chat",
      serverMessage: "model not found",
      message:
        'Ollama request to "/api/chat" failed with HTTP 404: model not found.',
    });
    await expect(promise).rejects.not.toHaveProperty(
      "message",
      expect.stringContaining("secret"),
    );
  });

  it.each([
    new Response("raw private body", { status: 500, statusText: "Error" }),
    jsonResponse({ message: "not the error property" }, { status: 400 }),
  ])("omits unusable HTTP error bodies", async (response) => {
    const fetch = vi.fn(async () => response);
    const promise = new OllamaClient({
      fetch: fetch as FetchImplementation,
    }).getVersion();
    await expect(promise).rejects.toBeInstanceOf(OllamaHttpError);
    await expect(promise).rejects.toMatchObject({
      endpoint: "/api/version",
      serverMessage: undefined,
    });
  });
});

describe("OllamaClient connection errors", () => {
  it("wraps a network failure and preserves its cause", async () => {
    const cause = new TypeError("fetch failed");
    const fetch = vi.fn(async () => {
      throw cause;
    });

    await expect(
      new OllamaClient({
        baseUrl: "http://localhost:11434",
        fetch: fetch as FetchImplementation,
      }).getVersion(),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaConnectionError",
        message: 'Unable to connect to Ollama at "http://localhost:11434".',
        baseUrl: "http://localhost:11434",
        cause,
      }),
    );
  });

  it("uses the transport error hierarchy", () => {
    expect(new OllamaConnectionError("http://localhost")).toBeInstanceOf(Error);
  });

  it("does not classify valid responses as connection failures", async () => {
    const fetch = vi.fn(async () => jsonResponse(validChatResponse));
    await expect(
      new OllamaClient({ fetch: fetch as FetchImplementation }).chat({
        model: "gemma3",
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toMatchObject({ done: true });
  });
});
