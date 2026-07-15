import {
  type FetchImplementation,
  OllamaClient,
  OllamaResponseError,
} from "@agentforge/ollama-client";
import { describe, expect, it, vi } from "vitest";
import { createFetch } from "./testUtils.js";

describe("OllamaClient.getVersion", () => {
  it("uses GET, the version endpoint, and JSON accept header", async () => {
    const fetch = createFetch();

    await new OllamaClient({ fetch }).getVersion();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:11434/api/version");
    expect(init).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns a frozen version and ignores extra properties", async () => {
    const client = new OllamaClient({
      fetch: createFetch({ version: "0.12.6", extra: true }),
    });

    const result = await client.getVersion();

    expect(result).toEqual({ version: "0.12.6" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("preserves version whitespace", async () => {
    const result = await new OllamaClient({
      fetch: createFetch({ version: " 0.12.6 " }),
    }).getVersion();
    expect(result.version).toBe(" 0.12.6 ");
  });

  it("rejects malformed JSON", async () => {
    const fetch = vi.fn(async () => new Response("not json"));
    await expect(
      new OllamaClient({ fetch: fetch as FetchImplementation }).getVersion(),
    ).rejects.toMatchObject({
      name: "OllamaResponseError",
      endpoint: "/api/version",
      cause: expect.anything(),
    });
  });

  it.each([{}, { version: "" }, { version: "  " }, { version: 1 }, []])(
    "rejects malformed version response %#",
    async (body) => {
      await expect(
        new OllamaClient({ fetch: createFetch(body) }).getVersion(),
      ).rejects.toBeInstanceOf(OllamaResponseError);
    },
  );
});
