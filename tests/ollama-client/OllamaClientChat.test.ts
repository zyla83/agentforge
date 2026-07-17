import {
  OllamaClient,
  OllamaRequestError,
  OllamaResponseError,
} from "@agentforge/ollama-client";
import { describe, expect, it } from "vitest";
import { createFetch, validChatResponse } from "./testUtils.js";

const validRequest = {
  model: "gemma3",
  messages: [{ role: "user" as const, content: "Hello" }],
};

describe("OllamaClient.chat request", () => {
  it("sends a non-streaming JSON POST", async () => {
    const fetch = createFetch(validChatResponse);

    await new OllamaClient({ fetch }).chat(validRequest);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gemma3",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    });
  });

  it("uses transport option names and omits undefined fields", async () => {
    const fetch = createFetch(validChatResponse);
    await new OllamaClient({ fetch }).chat({
      ...validRequest,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 256,
        stop: ["END"],
      },
    });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      model: "gemma3",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 256,
        stop: ["END"],
      },
    });
  });

  it("preserves a custom base path", async () => {
    const fetch = createFetch(validChatResponse);
    await new OllamaClient({
      baseUrl: "https://example.test/ollama/",
      fetch,
    }).chat(validRequest);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://example.test/ollama/api/chat",
    );
  });

  it("does not mutate caller input", async () => {
    const request = {
      model: " gemma3 ",
      messages: [{ role: "user" as const, content: " Hello " }],
      options: { stop: [" END "] },
    };
    const before = structuredClone(request);
    await new OllamaClient({ fetch: createFetch(validChatResponse) }).chat(
      request,
    );
    expect(request).toEqual(before);
  });
});

describe("OllamaClient.chat validation", () => {
  it.each([
    null,
    {},
    { ...validRequest, model: "" },
    { ...validRequest, model: "   " },
    { ...validRequest, messages: [] },
    { ...validRequest, messages: [null] },
    { ...validRequest, messages: [{ role: "user", content: " " }] },
    { ...validRequest, options: { temperature: -1 } },
    { ...validRequest, options: { temperature: 2.1 } },
    { ...validRequest, options: { top_p: 0 } },
    { ...validRequest, options: { top_p: 1.1 } },
    { ...validRequest, options: { num_predict: 0 } },
    { ...validRequest, options: { num_predict: 1.5 } },
    { ...validRequest, options: { stop: [] } },
    { ...validRequest, options: { stop: [""] } },
    {
      ...validRequest,
      options: { stop: Array.from({ length: 17 }, () => "x") },
    },
  ])("rejects malformed request %# without fetching", async (request) => {
    const fetch = createFetch(validChatResponse);
    await expect(
      new OllamaClient({ fetch }).chat(request as never),
    ).rejects.toBeInstanceOf(OllamaRequestError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("OllamaClient.chat response", () => {
  it("maps and freezes the complete response", async () => {
    const response = await new OllamaClient({
      fetch: createFetch({
        ...validChatResponse,
        done_reason: "stop",
        prompt_eval_count: 12,
        eval_count: 4,
        total_duration: 100,
      }),
    }).chat(validRequest);

    expect(response).toEqual({
      model: "gemma3",
      message: { role: "assistant", content: "Hello!" },
      done: true,
      doneReason: "stop",
      promptEvalCount: 12,
      evalCount: 4,
    });
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.message)).toBe(true);
  });

  it("permits empty response content", async () => {
    const response = await new OllamaClient({
      fetch: createFetch({
        ...validChatResponse,
        message: { role: "assistant", content: "" },
      }),
    }).chat(validRequest);
    expect(response.message.content).toBe("");
  });

  it.each([
    null,
    { ...validChatResponse, model: "" },
    { ...validChatResponse, message: null },
    { ...validChatResponse, message: { role: "tool", content: "x" } },
    { ...validChatResponse, message: { role: "assistant", content: 1 } },
    { ...validChatResponse, done: "true" },
    { ...validChatResponse, prompt_eval_count: -1 },
    { ...validChatResponse, eval_count: 1.5 },
  ])("rejects malformed response %#", async (body) => {
    await expect(
      new OllamaClient({ fetch: createFetch(body) }).chat(validRequest),
    ).rejects.toBeInstanceOf(OllamaResponseError);
  });
});
