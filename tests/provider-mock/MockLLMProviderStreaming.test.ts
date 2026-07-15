import { MockLLMProvider } from "@agentforge/provider-mock";
import {
  InvalidLLMRequestError,
  LLMFinishReason,
  LLMMessageRole,
  ProviderAbortError,
  isLLMStreamingProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMStreamEvent,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function createRequest(signal?: AbortSignal): LLMGenerationRequest {
  return {
    model: "test-model",
    messages: [{ role: LLMMessageRole.User, content: "Hello" }],
    ...(signal === undefined ? {} : { request: { signal } }),
  };
}

async function collect(
  events: AsyncIterable<LLMStreamEvent>,
): Promise<LLMStreamEvent[]> {
  const collected: LLMStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe("MockLLMProvider streaming", () => {
  it("streams configured deltas followed by a completed response", async () => {
    const provider = new MockLLMProvider({
      responseContent: "Hello world",
      streamDeltas: ["Hello", " ", "world"],
      finishReason: LLMFinishReason.Length,
    });

    const events = await collect(provider.stream(createRequest()));

    expect(events).toEqual([
      { type: "delta", model: "test-model", delta: "Hello" },
      { type: "delta", model: "test-model", delta: " " },
      { type: "delta", model: "test-model", delta: "world" },
      {
        type: "completed",
        response: {
          model: "test-model",
          message: {
            role: LLMMessageRole.Assistant,
            content: "Hello world",
          },
          finishReason: LLMFinishReason.Length,
        },
      },
    ]);
    expect(events.every(Object.isFrozen)).toBe(true);
    expect(
      Object.isFrozen(events[3]?.type === "completed" && events[3].response),
    ).toBe(true);
    expect(provider.getRequests()).toHaveLength(1);
  });

  it("uses the complete configured response as its default delta", async () => {
    const provider = new MockLLMProvider({ responseContent: "One delta" });

    const events = await collect(provider.stream(createRequest()));

    expect(events[0]).toEqual({
      type: "delta",
      model: "test-model",
      delta: "One delta",
    });
  });

  it("does not validate or record a request until iteration begins", async () => {
    const provider = new MockLLMProvider();
    const iterable = provider.stream({ model: "", messages: [] });

    expect(provider.getRequests()).toEqual([]);
    await expect(
      iterable[Symbol.asyncIterator]().next(),
    ).rejects.toBeInstanceOf(InvalidLLMRequestError);
    expect(provider.getRequests()).toEqual([]);
  });

  it("stops before completion when the caller aborts between deltas", async () => {
    const provider = new MockLLMProvider({
      responseContent: "ABC",
      streamDeltas: ["A", "B", "C"],
    });
    const controller = new AbortController();
    const iterator = provider
      .stream(createRequest(controller.signal))
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "delta", delta: "A" },
    });
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(iterator.next()).rejects.toMatchObject({
      name: ProviderAbortError.name,
      providerName: "mock-llm",
      cause: reason,
    });
  });

  it("is exposed through the streaming capability guard", () => {
    expect(isLLMStreamingProvider(new MockLLMProvider())).toBe(true);
  });
});

describe("MockLLMProvider stream configuration", () => {
  it.each([[], [""], [42], ["does not match"], "not-an-array"])(
    "rejects malformed stream deltas %j",
    (streamDeltas) => {
      expect(
        () =>
          new MockLLMProvider({
            responseContent: "response",
            streamDeltas: streamDeltas as string[],
          }),
      ).toThrow(InvalidLLMRequestError);
    },
  );

  it("snapshots configured deltas", async () => {
    const deltas = ["snap", "shot"];
    const provider = new MockLLMProvider({
      responseContent: "snapshot",
      streamDeltas: deltas,
    });
    deltas[0] = "mutated";

    const events = await collect(provider.stream(createRequest()));

    expect(events.slice(0, 2)).toMatchObject([
      { delta: "snap" },
      { delta: "shot" },
    ]);
  });
});
