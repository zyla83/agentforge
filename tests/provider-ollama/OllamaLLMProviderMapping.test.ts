import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import { LLMFinishReason, LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import {
  FakeOllamaClient,
  asOllamaClient,
  defaultChatResponse,
} from "./testUtils.js";

describe("OllamaLLMProvider request mapping", () => {
  it("maps fresh messages and preserves model and content", async () => {
    const client = new FakeOllamaClient();
    const provider = new OllamaLLMProvider({ client: asOllamaClient(client) });
    const request = {
      model: " model ",
      messages: [
        { role: LLMMessageRole.System, content: " system " },
        { role: LLMMessageRole.User, content: " user " },
        { role: LLMMessageRole.Assistant, content: " assistant " },
      ],
    };

    await provider.generate(request);

    const mapped = client.chatCalls[0]?.request;
    expect(mapped).toEqual({
      model: " model ",
      messages: [
        { role: "system", content: " system " },
        { role: "user", content: " user " },
        { role: "assistant", content: " assistant " },
      ],
    });
    expect(mapped?.messages).not.toBe(request.messages);
    mapped?.messages.forEach((message, index) => {
      expect(message).not.toBe(request.messages[index]);
    });
  });

  it("omits transport options without generation options", async () => {
    const client = new FakeOllamaClient();
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
    });
    expect(client.chatCalls[0]?.request).not.toHaveProperty("options");
  });

  it("maps an empty generation object to empty transport options", async () => {
    const client = new FakeOllamaClient();
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
      generation: {},
    });
    expect(client.chatCalls[0]?.request.options).toEqual({});
  });

  it("maps supplied generation options and copies stop", async () => {
    const client = new FakeOllamaClient();
    const stop = ["END"];
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
      generation: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 128,
        stop,
      },
    });
    expect(client.chatCalls[0]?.request.options).toEqual({
      temperature: 0.7,
      top_p: 0.9,
      num_predict: 128,
      stop: ["END"],
    });
    expect(client.chatCalls[0]?.request.options?.stop).not.toBe(stop);
  });

  it("does not mutate the source request", async () => {
    const client = new FakeOllamaClient();
    const request = {
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
      generation: { stop: ["END"] },
    };
    const before = structuredClone(request);
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
      request,
    );
    expect(request).toEqual(before);
  });
});

describe("OllamaLLMProvider response mapping", () => {
  it("returns a frozen AgentForge assistant response", async () => {
    const client = new FakeOllamaClient();
    client.chatResult = {
      model: "reported-model",
      message: { role: "user", content: " exact response " },
      done: true,
      doneReason: "stop",
    };
    const response = await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).generate({
      model: "requested-model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
    });
    expect(response).toEqual({
      model: "reported-model",
      message: {
        role: LLMMessageRole.Assistant,
        content: " exact response ",
      },
      finishReason: LLMFinishReason.Stop,
    });
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.message)).toBe(true);
    expect(response).not.toHaveProperty("done");
    expect(response).not.toHaveProperty("doneReason");
  });

  it.each([
    ["stop", true, LLMFinishReason.Stop],
    ["length", true, LLMFinishReason.Length],
    ["limit", true, LLMFinishReason.Length],
    ["max_tokens", true, LLMFinishReason.Length],
    ["other", true, LLMFinishReason.Unknown],
    ["STOP", true, LLMFinishReason.Unknown],
    [undefined, true, LLMFinishReason.Stop],
    [undefined, false, LLMFinishReason.Unknown],
  ])("maps finish reason %j", async (doneReason, done, expected) => {
    const client = new FakeOllamaClient();
    client.chatResult = { ...defaultChatResponse, done, doneReason };
    const response = await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).generate({
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
    });
    expect(response.finishReason).toBe(expected);
  });

  it.each([
    [12, 4, { inputTokens: 12, outputTokens: 4, totalTokens: 16 }],
    [12, undefined, { inputTokens: 12, outputTokens: 0, totalTokens: 12 }],
    [undefined, 4, { inputTokens: 0, outputTokens: 4, totalTokens: 4 }],
  ])("maps token counts", async (promptEvalCount, evalCount, expected) => {
    const client = new FakeOllamaClient();
    client.chatResult = {
      ...defaultChatResponse,
      promptEvalCount,
      evalCount,
    };
    const response = await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).generate({
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
    });
    expect(response.usage).toEqual(expected);
    expect(Object.isFrozen(response.usage)).toBe(true);
  });

  it("omits usage when both counts are absent", async () => {
    const response = await new OllamaLLMProvider({
      client: asOllamaClient(new FakeOllamaClient()),
    }).generate({
      model: "model",
      messages: [{ role: LLMMessageRole.User, content: "hello" }],
    });
    expect(response).not.toHaveProperty("usage");
  });
});
