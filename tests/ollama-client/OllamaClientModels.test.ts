import { OllamaClient, OllamaResponseError } from "@agentforge/ollama-client";
import { describe, expect, it } from "vitest";
import { createFetch } from "./testUtils.js";

describe("OllamaClient.listModels", () => {
  it("uses GET on the tags endpoint", async () => {
    const fetch = createFetch({ models: [] });
    await new OllamaClient({ fetch }).listModels();
    expect(fetch.mock.calls[0]?.[0]).toBe("http://localhost:11434/api/tags");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });

  it("returns a frozen empty list", async () => {
    const models = await new OllamaClient({
      fetch: createFetch({ models: [] }),
    }).listModels();
    expect(models).toEqual([]);
    expect(Object.isFrozen(models)).toBe(true);
  });

  it("maps and freezes a complete model", async () => {
    const client = new OllamaClient({
      fetch: createFetch({
        models: [
          {
            name: "gemma3",
            model: "gemma3",
            modified_at: "2025-10-03T23:34:03Z",
            size: 3338801804,
            digest: "abc",
            details: {
              format: "gguf",
              family: "gemma",
              families: ["gemma"],
              parameter_size: "4.3B",
              quantization_level: "Q4_K_M",
            },
            ignored: true,
          },
        ],
      }),
    });

    const models = await client.listModels();

    expect(models).toEqual([
      {
        name: "gemma3",
        model: "gemma3",
        modifiedAt: "2025-10-03T23:34:03Z",
        size: 3338801804,
        digest: "abc",
        details: {
          format: "gguf",
          family: "gemma",
          families: ["gemma"],
          parameterSize: "4.3B",
          quantizationLevel: "Q4_K_M",
        },
      },
    ]);
    expect(Object.isFrozen(models)).toBe(true);
    expect(Object.isFrozen(models[0])).toBe(true);
    expect(Object.isFrozen(models[0]?.details)).toBe(true);
    expect(Object.isFrozen(models[0]?.details?.families)).toBe(true);
  });

  it("omits absent optional fields", async () => {
    const models = await new OllamaClient({
      fetch: createFetch({ models: [{ name: "tiny", model: "tiny" }] }),
    }).listModels();
    expect(models).toEqual([{ name: "tiny", model: "tiny" }]);
  });

  it.each([
    null,
    {},
    { models: {} },
    { models: [null] },
    { models: [{ name: "", model: "valid" }] },
    { models: [{ name: "valid", model: "" }] },
    { models: [{ name: "valid", model: "valid", size: -1 }] },
    { models: [{ name: "valid", model: "valid", size: 1.5 }] },
    {
      models: [
        { name: "valid", model: "valid", details: { families: ["a", 1] } },
      ],
    },
    { models: [{ name: "valid", model: "valid", details: "bad" }] },
  ])("rejects malformed model response %#", async (body) => {
    await expect(
      new OllamaClient({ fetch: createFetch(body) }).listModels(),
    ).rejects.toBeInstanceOf(OllamaResponseError);
  });
});
