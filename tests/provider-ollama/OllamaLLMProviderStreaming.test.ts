import {
  OllamaAbortError,
  OllamaConnectionError,
  OllamaHttpError,
  OllamaResponseError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderAbortError,
  ProviderRequestError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  isLLMStreamingProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMStreamEvent,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

function createRequest(): LLMGenerationRequest {
  return {
    model: "llama3.1:8b",
    messages: [
      { role: LLMMessageRole.System, content: "Be concise." },
      { role: LLMMessageRole.User, content: "Hello" },
    ],
    generation: {
      temperature: 0.2,
      topP: 0.8,
      maxTokens: 50,
      stop: ["END"],
    },
    request: { timeoutMs: 5_000 },
  };
}

async function collect(
  iterable: AsyncIterable<LLMStreamEvent>,
): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("OllamaLLMProvider streaming", () => {
  it("maps Ollama chunks to frozen provider-independent stream events", async () => {
    const client = new FakeOllamaClient();
    client.streamResult = [
      {
        model: "llama3.1:8b",
        message: { role: "assistant", content: "Hello" },
        done: false,
      },
      {
        model: "llama3.1:8b",
        message: { role: "assistant", content: " world" },
        done: false,
      },
      {
        model: "llama3.1:8b",
        done: true,
        doneReason: "length",
        promptEvalCount: 4,
        evalCount: 2,
      },
    ];
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
    });

    const events = await collect(provider.stream(createRequest()));

    expect(events).toEqual([
      { type: "delta", model: "llama3.1:8b", delta: "Hello" },
      { type: "delta", model: "llama3.1:8b", delta: " world" },
      {
        type: "completed",
        response: {
          model: "llama3.1:8b",
          message: {
            role: LLMMessageRole.Assistant,
            content: "Hello world",
          },
          finishReason: LLMFinishReason.Length,
          usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
        },
      },
    ]);
    expect(events.every(Object.isFrozen)).toBe(true);
    expect(events.filter(({ type }) => type === "completed")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("completed");
    expect(client.chatCalls).toEqual([]);
  });

  it("maps the request and request options to chatStream", async () => {
    const client = new FakeOllamaClient();
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
    });

    await collect(provider.stream(createRequest()));

    expect(client.streamCalls).toEqual([
      {
        request: {
          model: "llama3.1:8b",
          messages: [
            { role: "system", content: "Be concise." },
            { role: "user", content: "Hello" },
          ],
          options: {
            temperature: 0.2,
            top_p: 0.8,
            num_predict: 50,
            stop: ["END"],
          },
        },
        options: { timeoutMs: 5_000 },
      },
    ]);
  });

  it("is lazy and validates only when iteration begins", async () => {
    const client = new FakeOllamaClient();
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
    });
    const iterable = provider.stream(createRequest());

    expect(client.streamCalls).toEqual([]);
    await iterable[Symbol.asyncIterator]().next();
    expect(client.streamCalls).toHaveLength(1);
  });

  it("ignores empty content chunks and uses the requested model as fallback", async () => {
    const client = new FakeOllamaClient();
    client.streamResult = [
      { message: { role: "assistant", content: "" }, done: false },
      { message: { role: "assistant", content: "answer" }, done: false },
      { done: true },
    ];
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
    });

    const events = await collect(provider.stream(createRequest()));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "delta",
      model: "llama3.1:8b",
      delta: "answer",
    });
    expect(events[1]).toMatchObject({
      type: "completed",
      response: { model: "llama3.1:8b" },
    });
  });

  it("rejects a stream that ends before its completion chunk", async () => {
    const client = new FakeOllamaClient();
    client.streamResult = [
      {
        model: "model",
        message: { role: "assistant", content: "partial" },
        done: false,
      },
    ];

    await expect(
      collect(
        new OllamaLLMProvider({ client: asOllamaClient(client) }).stream(
          createRequest(),
        ),
      ),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("rejects conflicting model names", async () => {
    const client = new FakeOllamaClient();
    client.streamResult = [
      { model: "first", done: false },
      { model: "second", done: true },
    ];

    await expect(
      collect(
        new OllamaLLMProvider({ client: asOllamaClient(client) }).stream(
          createRequest(),
        ),
      ),
    ).rejects.toMatchObject({ name: "ProviderRequestError" });
  });

  it("is exposed through the streaming capability guard", () => {
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(new FakeOllamaClient()),
    });

    expect(isLLMStreamingProvider(provider)).toBe(true);
  });
});

describe("OllamaLLMProvider streaming errors", () => {
  it.each([
    [new OllamaAbortError("/api/chat"), ProviderAbortError],
    [new OllamaTimeoutError("/api/chat", 5_000), ProviderTimeoutError],
    [
      new OllamaConnectionError("http://127.0.0.1:11434"),
      ProviderUnavailableError,
    ],
    [
      new OllamaHttpError("/api/chat", 500, "Internal Server Error"),
      ProviderRequestError,
    ],
    [new OllamaResponseError("/api/chat", ["invalid"]), ProviderRequestError],
  ])(
    "maps a transport error emitted during streaming",
    async (error, expected) => {
      const client = new FakeOllamaClient();
      client.streamResult = [];
      client.streamError = error;
      const provider = new OllamaLLMProvider({
        client: asOllamaClient(client),
      });

      await expect(
        collect(provider.stream(createRequest())),
      ).rejects.toBeInstanceOf(expected);
    },
  );

  it("preserves deltas yielded before a mapped transport failure", async () => {
    const client = new FakeOllamaClient();
    client.streamResult = [
      {
        model: "llama3.1:8b",
        message: { role: "assistant", content: "partial" },
        done: false,
      },
    ];
    client.streamError = new OllamaConnectionError("http://127.0.0.1:11434");
    const iterator = new OllamaLLMProvider({
      client: asOllamaClient(client),
    })
      .stream(createRequest())
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "delta", delta: "partial" },
    });
    await expect(iterator.next()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("does not emit completion when the transport fails after its done chunk", async () => {
    const client = new FakeOllamaClient();
    client.streamResult = [
      {
        model: "llama3.1:8b",
        message: { role: "assistant", content: "partial" },
        done: false,
      },
      {
        model: "llama3.1:8b",
        done: true,
        doneReason: "stop",
      },
    ];
    client.streamError = new OllamaResponseError("/api/chat", [
      "stream[2]: data is not allowed after completion",
    ]);
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(client),
    });
    const events: LLMStreamEvent[] = [];

    await expect(
      (async () => {
        for await (const event of provider.stream(createRequest())) {
          events.push(event);
        }
      })(),
    ).rejects.toBeInstanceOf(ProviderRequestError);

    expect(events).toEqual([
      { type: "delta", model: "llama3.1:8b", delta: "partial" },
    ]);
    expect(events.some(({ type }) => type === "completed")).toBe(false);
  });
});
