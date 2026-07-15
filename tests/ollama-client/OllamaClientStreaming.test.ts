import {
  type FetchImplementation,
  OllamaAbortError,
  type OllamaChatStreamChunk,
  OllamaClient,
  OllamaConnectionError,
  OllamaHttpError,
  OllamaResponseError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const request = {
  model: "gemma3",
  messages: [{ role: "user" as const, content: "Hello" }],
};

afterEach(() => vi.useRealTimers());

function streamResponse(
  chunks: readonly (string | Uint8Array)[],
  init?: ResponseInit,
): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(
            typeof chunk === "string" ? encoder.encode(chunk) : chunk,
          );
        }
        controller.close();
      },
    }),
    {
      headers: { "Content-Type": "application/x-ndjson" },
      ...init,
    },
  );
}

async function collect(
  iterable: AsyncIterable<OllamaChatStreamChunk>,
): Promise<OllamaChatStreamChunk[]> {
  const values: OllamaChatStreamChunk[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe("OllamaClient.chatStream request", () => {
  it("is lazy and sends an NDJSON POST with stream enabled", async () => {
    const fetch = vi.fn(async () => streamResponse(['{"done":true}\n']));
    const source = structuredClone(request);
    const stream = new OllamaClient({
      fetch: fetch as FetchImplementation,
    }).chatStream(request);
    expect(fetch).not.toHaveBeenCalled();

    await collect(stream);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gemma3",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    });
    expect(request).toEqual(source);
  });

  it("preserves mapped options and a custom base path", async () => {
    const fetch = vi.fn(async () => streamResponse(['{"done":true}\n']));
    await collect(
      new OllamaClient({
        baseUrl: "https://example.test/ollama",
        fetch: fetch as FetchImplementation,
      }).chatStream({
        ...request,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 10,
          stop: ["END"],
        },
      }),
    );
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://example.test/ollama/api/chat",
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).options).toEqual({
      temperature: 0.7,
      top_p: 0.9,
      num_predict: 10,
      stop: ["END"],
    });
  });
});

describe("OllamaClient.chatStream parsing", () => {
  it.each([
    [
      [
        '{"message":{"role":"assistant","content":"A"},"done":false}\n',
        '{"done":true}\n',
      ],
      "one line per chunk",
    ],
    [
      [
        '{"message":{"role":"assistant","content":"A"},"done":false}\n{"done":true}\n',
      ],
      "multiple lines per chunk",
    ],
    [
      [
        '{"message":{"role":"assistant",',
        '"content":"A"},"done":false}\n{"done":true}',
      ],
      "split line and no final newline",
    ],
    [
      [
        '\r\n{"message":{"role":"assistant","content":"A"},"done":false}\r\n\r\n{"done":true}\r\n',
      ],
      "CRLF and blank lines",
    ],
  ])("parses %s", async (chunks) => {
    const client = new OllamaClient({
      fetch: (async () => streamResponse(chunks)) as FetchImplementation,
    });
    const values = await collect(client.chatStream(request));
    expect(values).toHaveLength(2);
    expect(values[0]?.message?.content).toBe("A");
    expect(values[1]?.done).toBe(true);
  });

  it("decodes a UTF-8 character split across chunks", async () => {
    const bytes = new TextEncoder().encode(
      '{"message":{"role":"assistant","content":"ż"},"done":false}\n{"done":true}\n',
    );
    const marker = bytes.indexOf(0xc5);
    const client = new OllamaClient({
      fetch: (async () =>
        streamResponse([
          bytes.slice(0, marker + 1),
          bytes.slice(marker + 1),
        ])) as FetchImplementation,
    });
    const values = await collect(client.chatStream(request));
    expect(values[0]?.message?.content).toBe("ż");
  });

  it("maps final counts and freezes chunks and messages", async () => {
    const client = new OllamaClient({
      fetch: (async () =>
        streamResponse([
          '{"model":"gemma3","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":12,"eval_count":4}\n',
        ])) as FetchImplementation,
    });
    const [chunk] = await collect(client.chatStream(request));
    expect(chunk).toEqual({
      model: "gemma3",
      message: { role: "assistant", content: "" },
      done: true,
      doneReason: "stop",
      promptEvalCount: 12,
      evalCount: 4,
    });
    expect(Object.isFrozen(chunk)).toBe(true);
    expect(Object.isFrozen(chunk?.message)).toBe(true);
  });

  it("accepts a final chunk without a message", async () => {
    const values = await collect(
      new OllamaClient({
        fetch: (async () =>
          streamResponse([
            '{"model":"gemma3","done":true}\n',
          ])) as FetchImplementation,
      }).chatStream(request),
    );
    expect(values).toEqual([{ model: "gemma3", done: true }]);
  });
});

describe("OllamaClient.chatStream protocol errors", () => {
  it.each([
    [["not-json\n"], "valid JSON"],
    [["[]\n"], "must be an object"],
    [["{}\n"], ".done"],
    [['{"done":false,"message":null}\n'], ".message"],
    [['{"done":false,"prompt_eval_count":-1}\n'], "prompt_eval_count"],
    [['{"done":false}\n'], "ended before"],
    [['{"done":true}\n{"done":true}\n'], "after completion"],
    [['{"done":true}\n{"done":false}\n'], "after completion"],
  ])("rejects malformed protocol %#", async (chunks, detail) => {
    await expect(
      collect(
        new OllamaClient({
          fetch: (async () => streamResponse(chunks)) as FetchImplementation,
        }).chatStream(request),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaResponseError",
        endpoint: "/api/chat",
        message: expect.stringContaining(detail),
      }),
    );
  });

  it("rejects a successful response without a body", async () => {
    const response = new Response(null, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
    await expect(
      collect(
        new OllamaClient({
          fetch: (async () => response) as FetchImplementation,
        }).chatStream(request),
      ),
    ).rejects.toBeInstanceOf(OllamaResponseError);
  });

  it.each([null, "application/json", "text/plain"])(
    "rejects content type %s",
    async (contentType) => {
      const headers =
        contentType === null ? {} : { "Content-Type": contentType };
      await expect(
        collect(
          new OllamaClient({
            fetch: (async () =>
              streamResponse(['{"done":true}\n'], {
                headers,
              })) as FetchImplementation,
          }).chatStream(request),
        ),
      ).rejects.toBeInstanceOf(OllamaResponseError);
    },
  );

  it("accepts content-type parameters", async () => {
    const values = await collect(
      new OllamaClient({
        fetch: (async () =>
          streamResponse(['{"done":true}\n'], {
            headers: {
              "Content-Type": "application/x-ndjson; charset=utf-8",
            },
          })) as FetchImplementation,
      }).chatStream(request),
    );
    expect(values).toHaveLength(1);
  });

  it("maps a mid-stream error object to OllamaHttpError", async () => {
    const promise = collect(
      new OllamaClient({
        fetch: (async () =>
          streamResponse([
            '{"done":false}\n{"error":"model failed"}\n',
          ])) as FetchImplementation,
      }).chatStream(request),
    );
    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaHttpError",
        status: 200,
        serverMessage: "model failed",
      }),
    );
  });

  it("rejects a non-string mid-stream error", async () => {
    await expect(
      collect(
        new OllamaClient({
          fetch: (async () =>
            streamResponse(['{"error":42}\n'])) as FetchImplementation,
        }).chatStream(request),
      ),
    ).rejects.toBeInstanceOf(OllamaResponseError);
  });

  it("preserves non-2xx HTTP errors without reclassification", async () => {
    await expect(
      collect(
        new OllamaClient({
          fetch: (async () =>
            new Response(JSON.stringify({ error: "missing" }), {
              status: 404,
              statusText: "Not Found",
            })) as FetchImplementation,
        }).chatStream(request),
      ),
    ).rejects.toBeInstanceOf(OllamaHttpError);
  });
});

describe("OllamaClient.chatStream cancellation and cleanup", () => {
  function waitingFetch(): FetchImplementation {
    return vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(init.signal?.reason),
                { once: true },
              );
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        ),
    ) as FetchImplementation;
  }

  it("pre-abort prevents fetch", async () => {
    const fetch = waitingFetch();
    await expect(
      collect(
        new OllamaClient({ fetch }).chatStream(request, {
          signal: AbortSignal.abort("cancelled"),
        }),
      ),
    ).rejects.toBeInstanceOf(OllamaAbortError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("classifies caller abort while reading", async () => {
    const controller = new AbortController();
    const promise = collect(
      new OllamaClient({ fetch: waitingFetch() }).chatStream(request, {
        signal: controller.signal,
      }),
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(OllamaAbortError);
    controller.abort(new Error("cancelled"));
    await assertion;
  });

  it("classifies timeout while reading and preserves value", async () => {
    vi.useFakeTimers();
    const promise = collect(
      new OllamaClient({ fetch: waitingFetch() }).chatStream(request, {
        timeoutMs: 25,
      }),
    );
    const assertion = expect(promise).rejects.toMatchObject({
      name: "OllamaTimeoutError",
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("clears timeout after successful completion", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return streamResponse(['{"done":true}\n']);
      },
    );
    await collect(
      new OllamaClient({ fetch: fetch as FetchImplementation }).chatStream(
        request,
        { timeoutMs: 10 },
      ),
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears timeout after a parser failure", async () => {
    vi.useFakeTimers();
    await expect(
      collect(
        new OllamaClient({
          fetch: (async () =>
            streamResponse(["not-json\n"])) as FetchImplementation,
        }).chatStream(request, { timeoutMs: 10 }),
      ),
    ).rejects.toBeInstanceOf(OllamaResponseError);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the reader on early consumer termination", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              '{"message":{"role":"assistant","content":"A"},"done":false}\n',
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
    for await (const _chunk of new OllamaClient({
      fetch: (async () => response) as FetchImplementation,
    }).chatStream(request)) {
      break;
    }
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps unclassified reader failures to connection errors", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("read failed"));
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
    await expect(
      collect(
        new OllamaClient({
          fetch: (async () => response) as FetchImplementation,
        }).chatStream(request),
      ),
    ).rejects.toBeInstanceOf(OllamaConnectionError);
  });
});
