import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  InvalidLLMRequestError,
  LLMMessageRole,
  ProviderAbortError,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

const validRequest = {
  model: "model",
  messages: [{ role: LLMMessageRole.User, content: "hello" }],
};

describe("OllamaLLMProvider request options", () => {
  it("omits transport request options when absent", async () => {
    const client = new FakeOllamaClient();
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
      validRequest,
    );
    expect(client.chatCalls[0]?.options).toBeUndefined();
  });

  it("maps signal only and preserves its reference", async () => {
    const client = new FakeOllamaClient();
    const signal = new AbortController().signal;
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
      ...validRequest,
      request: { signal },
    });
    expect(client.chatCalls[0]?.options).toEqual({ signal });
    expect(client.chatCalls[0]?.options?.signal).toBe(signal);
  });

  it("maps timeout only", async () => {
    const client = new FakeOllamaClient();
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
      ...validRequest,
      request: { timeoutMs: 250 },
    });
    expect(client.chatCalls[0]?.options).toEqual({ timeoutMs: 250 });
  });

  it("maps signal and timeout together", async () => {
    const client = new FakeOllamaClient();
    const signal = new AbortController().signal;
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
      ...validRequest,
      request: { signal, timeoutMs: 250 },
    });
    expect(client.chatCalls[0]?.options).toEqual({ signal, timeoutMs: 250 });
  });

  it("rejects invalid requests before calling the client", async () => {
    const client = new FakeOllamaClient();
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
        model: "",
        messages: [],
      }),
    ).rejects.toBeInstanceOf(InvalidLLMRequestError);
    expect(client.chatCalls).toEqual([]);
  });

  it("rejects an already-aborted request before calling the client", async () => {
    const client = new FakeOllamaClient();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).generate({
        ...validRequest,
        request: { signal: controller.signal },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderAbortError",
        providerName: "ollama",
        cause: reason,
      }),
    );
    expect(client.chatCalls).toEqual([]);
  });

  it("uses the SDK abort error type", () => {
    expect(new ProviderAbortError("ollama")).toBeInstanceOf(Error);
  });
});
