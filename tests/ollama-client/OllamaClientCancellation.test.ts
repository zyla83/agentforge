import {
  type FetchImplementation,
  OllamaAbortError,
  OllamaClient,
  OllamaRequestError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "./testUtils.js";

afterEach(() => {
  vi.useRealTimers();
});

function abortAwareFetch(): FetchImplementation {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      }),
  ) as FetchImplementation;
}

describe("OllamaClient cancellation", () => {
  it("does not fetch for an already-aborted signal", async () => {
    const fetch = abortAwareFetch();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(
      new OllamaClient({ fetch }).getVersion({ signal: controller.signal }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaAbortError",
        endpoint: "/api/version",
        cause: reason,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("classifies caller cancellation during fetch", async () => {
    const fetch = abortAwareFetch();
    const controller = new AbortController();
    const reason = { type: "user-cancelled" };
    const promise = new OllamaClient({ fetch }).getVersion({
      signal: controller.signal,
    });

    controller.abort(reason);

    await expect(promise).rejects.toBeInstanceOf(OllamaAbortError);
    await expect(promise).rejects.toMatchObject({ cause: reason });
  });

  it("rejects malformed per-request options before fetch", async () => {
    const fetch = abortAwareFetch();
    await expect(
      new OllamaClient({ fetch }).getVersion({ timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(OllamaRequestError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("OllamaClient timeouts", () => {
  it("classifies a default timeout", async () => {
    vi.useFakeTimers();
    const promise = new OllamaClient({
      fetch: abortAwareFetch(),
      defaultTimeoutMs: 50,
    }).getVersion();
    const assertion = expect(promise).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaTimeoutError",
        endpoint: "/api/version",
        timeoutMs: 50,
      }),
    );

    await vi.advanceTimersByTimeAsync(50);

    await assertion;
  });

  it("uses the per-request timeout override", async () => {
    vi.useFakeTimers();
    const promise = new OllamaClient({
      fetch: abortAwareFetch(),
      defaultTimeoutMs: 1000,
    }).getVersion({ timeoutMs: 25 });
    const timeoutAssertion =
      expect(promise).rejects.toBeInstanceOf(OllamaTimeoutError);
    const detailAssertion = expect(promise).rejects.toMatchObject({
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    await timeoutAssertion;
    await detailAssertion;
  });

  it("resolves before the timeout and cleans up its timer", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | null = null;
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedSignal = init?.signal ?? null;
        return jsonResponse({ version: "0.12.6" });
      },
    );

    await expect(
      new OllamaClient({
        fetch: fetch as FetchImplementation,
        defaultTimeoutMs: 10,
      }).getVersion(),
    ).resolves.toEqual({ version: "0.12.6" });

    await vi.advanceTimersByTimeAsync(20);
    expect((receivedSignal as AbortSignal | null)?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
