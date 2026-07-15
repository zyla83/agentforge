import {
  type FetchImplementation,
  OllamaClient,
  OllamaRequestError,
} from "@agentforge/ollama-client";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse } from "./testUtils.js";

describe("OllamaClient options", () => {
  it("uses the default base URL", () => {
    expect(new OllamaClient().getBaseUrl()).toBe("http://localhost:11434");
  });

  it.each([
    ["http://127.0.0.1:11434/", "http://127.0.0.1:11434"],
    ["http://127.0.0.1:11434///", "http://127.0.0.1:11434"],
    ["https://ollama.example.test", "https://ollama.example.test"],
    [
      "https://ollama.example.test/api-root/",
      "https://ollama.example.test/api-root",
    ],
  ])("normalizes %s", (baseUrl, expected) => {
    expect(new OllamaClient({ baseUrl }).getBaseUrl()).toBe(expected);
  });

  it.each([
    ["", "non-empty string"],
    ["   ", "non-empty string"],
    ["localhost:11434", "protocol"],
    ["ftp://localhost:11434", "protocol"],
    ["http://localhost:11434?", "query strings"],
    ["http://localhost:11434?key=value", "query strings"],
    ["http://localhost:11434#", "fragments"],
    ["http://localhost:11434#section", "fragments"],
  ])("rejects invalid base URL %j", (baseUrl, detail) => {
    expect(() => new OllamaClient({ baseUrl })).toThrowError(
      expect.objectContaining({
        name: "OllamaRequestError",
        details: expect.arrayContaining([expect.stringContaining(detail)]),
      }),
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10"])(
    "rejects invalid timeout %j",
    (defaultTimeoutMs) => {
      expect(
        () =>
          new OllamaClient({
            defaultTimeoutMs: defaultTimeoutMs as number,
          }),
      ).toThrow(OllamaRequestError);
    },
  );

  it("rejects a malformed fetch implementation", () => {
    expect(
      () =>
        new OllamaClient({
          fetch: 42 as unknown as FetchImplementation,
        }),
    ).toThrow(OllamaRequestError);
  });

  it("does not mutate the input options and uses injected fetch", async () => {
    const fetch = vi.fn(async () => jsonResponse({ version: "1.0.0" }));
    const options = {
      baseUrl: "http://localhost:11434/",
      defaultTimeoutMs: 50,
      fetch: fetch as FetchImplementation,
    };
    const original = { ...options };

    await new OllamaClient(options).getVersion();

    expect(options).toEqual(original);
    expect(options.fetch).toBe(fetch);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects malformed runtime option objects", () => {
    expect(() => new OllamaClient(null as unknown as undefined)).toThrow(
      OllamaRequestError,
    );
  });
});
