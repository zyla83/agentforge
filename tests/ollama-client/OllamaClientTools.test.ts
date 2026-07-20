import {
  type FetchImplementation,
  OllamaClient,
  OllamaRequestError,
  OllamaResponseError,
} from "@agentforge/ollama-client";
import { describe, expect, it, vi } from "vitest";
import { createFetch, validChatResponse } from "./testUtils.js";

const weatherTool = {
  type: "function" as const,
  function: {
    name: "weather",
    description: "Get the weather.",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
};

const toolRequest = {
  model: "gemma3",
  messages: [{ role: "user" as const, content: "What is the weather?" }],
  tools: [weatherTool],
};

const toolCall = {
  function: {
    name: "weather",
    arguments: { city: "Warsaw" },
  },
};

function streamResponse(lines: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) values.push(value);
  return values;
}

describe("Ollama tool request validation", () => {
  it("accepts tools, assistant calls, and tool results", async () => {
    const fetch = createFetch(validChatResponse);
    await new OllamaClient({ fetch }).chat({
      ...toolRequest,
      messages: [
        ...toolRequest.messages,
        { role: "assistant", content: "", toolCalls: [toolCall] },
        { role: "tool", content: '{"temperature":21}' },
      ],
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("preserves tool order", async () => {
    const fetch = createFetch(validChatResponse);
    await new OllamaClient({ fetch }).chat({
      ...toolRequest,
      tools: [
        weatherTool,
        {
          type: "function",
          function: { name: "clock", parameters: { type: "object" } },
        },
      ],
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(
      body.tools.map(
        (tool: { function: { name: string } }) => tool.function.name,
      ),
    ).toEqual(["weather", "clock"]);
  });

  it.each([
    [{ ...toolRequest, tools: [] }, "tools: must be a non-empty array"],
    [
      { ...toolRequest, tools: [weatherTool, weatherTool] },
      "duplicate tool name",
    ],
    [
      { ...toolRequest, tools: [{ ...weatherTool, type: "other" }] },
      'tools[0].type: must be "function"',
    ],
    [
      {
        ...toolRequest,
        tools: [
          { ...weatherTool, function: { ...weatherTool.function, name: "" } },
        ],
      },
      "tools[0].function.name: must be a non-empty string",
    ],
    [
      {
        ...toolRequest,
        tools: [
          {
            ...weatherTool,
            function: { ...weatherTool.function, parameters: [] },
          },
        ],
      },
      "tools[0].function.parameters: must be a JSON object",
    ],
    [
      {
        ...toolRequest,
        messages: [
          {
            role: "assistant",
            content: "",
            toolCalls: [{ function: { name: "weather", arguments: [] } }],
          },
        ],
      },
      "messages[0].toolCalls[0].function.arguments: must be a JSON object",
    ],
  ])("rejects malformed tool input %#", async (request, detail) => {
    const fetch = createFetch(validChatResponse);
    await expect(
      new OllamaClient({ fetch }).chat(request as never),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaRequestError",
        message: expect.stringContaining(detail),
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects cyclic JSON values", async () => {
    const parameters: Record<string, unknown> = {};
    parameters.self = parameters;
    await expect(
      new OllamaClient({ fetch: createFetch() }).chat({
        ...toolRequest,
        tools: [
          { ...weatherTool, function: { ...weatherTool.function, parameters } },
        ],
      } as never),
    ).rejects.toBeInstanceOf(OllamaRequestError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects the non-finite JSON number %s",
    async (value) => {
      await expect(
        new OllamaClient({ fetch: createFetch() }).chat({
          ...toolRequest,
          tools: [
            {
              ...weatherTool,
              function: { ...weatherTool.function, parameters: { value } },
            },
          ],
        } as never),
      ).rejects.toBeInstanceOf(OllamaRequestError);
    },
  );

  it("rejects sparse JSON arrays", async () => {
    const values = Array<string>(2);
    values[1] = "present";
    await expect(
      new OllamaClient({ fetch: createFetch() }).chat({
        ...toolRequest,
        tools: [
          {
            ...weatherTool,
            function: { ...weatherTool.function, parameters: { values } },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(OllamaRequestError);
  });

  it("does not freeze or mutate caller input", async () => {
    const request = structuredClone(toolRequest);
    await new OllamaClient({ fetch: createFetch(validChatResponse) }).chat(
      request,
    );
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(request.tools)).toBe(false);
    request.tools[0]?.function.parameters.required?.push("country");
    expect(request.tools[0]?.function.parameters.required).toEqual([
      "city",
      "country",
    ]);
  });
});

describe("Ollama tool request serialization", () => {
  it("serializes tools and tool history at the transport boundary", async () => {
    const fetch = createFetch(validChatResponse);
    await new OllamaClient({ fetch }).chat({
      ...toolRequest,
      messages: [
        ...toolRequest.messages,
        { role: "assistant", content: "", toolCalls: [toolCall] },
        { role: "tool", content: '{"temperature":21}' },
      ],
      options: { temperature: 0.5 },
    });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      model: "gemma3",
      messages: [
        { role: "user", content: "What is the weather?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: {
                name: "weather",
                arguments: { city: "Warsaw" },
              },
            },
          ],
        },
        { role: "tool", content: '{"temperature":21}' },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "weather",
            description: "Get the weather.",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
      ],
      stream: false,
      options: { temperature: 0.5 },
    });
  });

  it("sets the stream flag without changing tool serialization", async () => {
    const fetch = vi.fn(async () => streamResponse(['{"done":true}\n']));
    await collect(
      new OllamaClient({ fetch: fetch as FetchImplementation }).chatStream(
        toolRequest,
      ),
    );
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.stream).toBe(true);
    expect(body.tools).toHaveLength(1);
  });
});

describe("Ollama tool response parsing", () => {
  it("parses ordered calls with nested and Unicode arguments", async () => {
    const response = await new OllamaClient({
      fetch: createFetch({
        model: "gemma3",
        message: {
          role: "assistant",
          content: "I will check.",
          tool_calls: [
            toolCall,
            {
              function: {
                name: "details",
                arguments: { city: "Łódź", nested: { units: ["°C"] } },
              },
            },
          ],
        },
        done: true,
        done_reason: "custom-reason",
      }),
    }).chat(toolRequest);

    expect(response.message).toEqual({
      role: "assistant",
      content: "I will check.",
      toolCalls: [
        toolCall,
        {
          function: {
            name: "details",
            arguments: { city: "Łódź", nested: { units: ["°C"] } },
          },
        },
      ],
    });
    expect(response.doneReason).toBe("custom-reason");
    const message = response.message as typeof response.message & {
      toolCalls: readonly (typeof toolCall)[];
    };
    expect(Object.isFrozen(message)).toBe(true);
    expect(Object.isFrozen(message.toolCalls)).toBe(true);
    expect(Object.isFrozen(message.toolCalls[0])).toBe(true);
    expect(Object.isFrozen(message.toolCalls[0]?.function)).toBe(true);
    expect(
      Object.isFrozen(message.toolCalls[1]?.function.arguments.nested),
    ).toBe(true);
  });

  it("accepts and omits validated Ollama tool-call metadata", async () => {
    const response = await new OllamaClient({
      fetch: createFetch({
        model: "llama3.1:8b",
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-calculator",
              function: {
                index: 0,
                name: "calculator",
                arguments: {
                  operation: "divide",
                  left: 144,
                  right: 12,
                  nested: { values: [12] },
                },
              },
            },
            {
              id: "call-weather",
              function: {
                index: 1,
                name: "weather",
                arguments: { city: "Warsaw" },
              },
            },
          ],
        },
        done: true,
      }),
    }).chat(toolRequest);

    expect(response.message?.toolCalls).toEqual([
      {
        function: {
          name: "calculator",
          arguments: {
            operation: "divide",
            left: 144,
            right: 12,
            nested: { values: [12] },
          },
        },
      },
      toolCall,
    ]);
    const calls = response.message?.toolCalls ?? [];
    expect(calls[0]).not.toHaveProperty("id");
    expect(calls[0]?.function).not.toHaveProperty("index");
    expect(Object.isFrozen(calls)).toBe(true);
    expect(Object.isFrozen(calls[0])).toBe(true);
    expect(Object.isFrozen(calls[0]?.function)).toBe(true);
    expect(Object.isFrozen(calls[0]?.function.arguments)).toBe(true);
    expect(Object.isFrozen(calls[0]?.function.arguments.nested)).toBe(true);
    expect(
      Object.isFrozen(
        (calls[0]?.function.arguments.nested as { values: unknown[] }).values,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "empty id",
      { id: "", function: toolCall.function },
      ".id: must be a non-empty string",
    ],
    [
      "non-string id",
      { id: 42, function: toolCall.function },
      ".id: must be a non-empty string",
    ],
    [
      "negative index",
      { function: { ...toolCall.function, index: -1 } },
      ".function.index: must be a non-negative safe integer",
    ],
    [
      "fractional index",
      { function: { ...toolCall.function, index: 0.5 } },
      ".function.index: must be a non-negative safe integer",
    ],
    [
      "non-number index",
      { function: { ...toolCall.function, index: "0" } },
      ".function.index: must be a non-negative safe integer",
    ],
    [
      "unsafe index",
      {
        function: {
          ...toolCall.function,
          index: Number.MAX_SAFE_INTEGER + 1,
        },
      },
      ".function.index: must be a non-negative safe integer",
    ],
  ])("rejects %s metadata", async (_name, call, path) => {
    await expect(
      new OllamaClient({
        fetch: createFetch({
          model: "llama3.1:8b",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [call],
          },
          done: true,
        }),
      }).chat(toolRequest),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaResponseError",
        endpoint: "/api/chat",
        message: expect.stringContaining(`message.tool_calls[0]${path}`),
      }),
    );
  });

  it.each([
    [
      { function: toolCall.function, unexpected: true },
      "message.tool_calls[0].unexpected: unknown property",
    ],
    [
      { function: { ...toolCall.function, unexpected: true } },
      "message.tool_calls[0].function.unexpected: unknown property",
    ],
  ])("still rejects unknown response metadata %#", async (call, detail) => {
    await expect(
      new OllamaClient({
        fetch: createFetch({
          model: "llama3.1:8b",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [call],
          },
          done: true,
        }),
      }).chat(toolRequest),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaResponseError",
        message: expect.stringContaining(detail),
      }),
    );
  });

  it.each([
    [null, "message.tool_calls: must be an array"],
    [[null], "message.tool_calls[0]: must be an object"],
    [[{}], "message.tool_calls[0].function: must be an object"],
    [
      [{ function: { name: "", arguments: {} } }],
      "message.tool_calls[0].function.name: must be a non-empty string",
    ],
    [
      [{ function: { name: "weather", arguments: [] } }],
      "message.tool_calls[0].function.arguments: must be a JSON object",
    ],
  ])("rejects malformed response tool calls %#", async (toolCalls, detail) => {
    await expect(
      new OllamaClient({
        fetch: createFetch({
          model: "gemma3",
          message: { role: "assistant", content: "", tool_calls: toolCalls },
          done: true,
        }),
      }).chat(toolRequest),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaResponseError",
        endpoint: "/api/chat",
        message: expect.stringContaining(detail),
      }),
    );
  });
});

describe("Ollama streaming tool response parsing", () => {
  it("exposes each tool-call chunk without aggregation", async () => {
    const fetch = (async () =>
      streamResponse([
        `${JSON.stringify({
          model: "gemma3",
          message: { role: "assistant", content: "", tool_calls: [toolCall] },
          done: false,
        })}\n`,
        `${JSON.stringify({
          message: {
            role: "assistant",
            content: "done",
            tool_calls: [
              { function: { name: "details", arguments: { city: "Łódź" } } },
            ],
          },
          done: true,
        })}\n`,
      ])) as FetchImplementation;
    const chunks = await collect(
      new OllamaClient({ fetch }).chatStream(toolRequest),
    );
    expect(chunks[0]?.message).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [toolCall],
    });
    expect(chunks[1]?.message).toEqual({
      role: "assistant",
      content: "done",
      toolCalls: [
        { function: { name: "details", arguments: { city: "Łódź" } } },
      ],
    });
    const first = chunks[0]?.message as {
      toolCalls: readonly (typeof toolCall)[];
    };
    expect(Object.isFrozen(first.toolCalls)).toBe(true);
    expect(Object.isFrozen(first.toolCalls[0]?.function.arguments)).toBe(true);
  });

  it("accepts and omits tool-call metadata without changing completion", async () => {
    const fetch = (async () =>
      streamResponse([
        `${JSON.stringify({
          model: "llama3.1:8b",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call-calculator",
                function: {
                  index: 0,
                  name: "calculator",
                  arguments: { operation: "divide", left: 144, right: 12 },
                },
              },
            ],
          },
          done: true,
          done_reason: "stop",
        })}\n`,
      ])) as FetchImplementation;

    const chunks = await collect(
      new OllamaClient({ fetch }).chatStream(toolRequest),
    );

    expect(chunks).toEqual([
      {
        model: "llama3.1:8b",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              function: {
                name: "calculator",
                arguments: { operation: "divide", left: 144, right: 12 },
              },
            },
          ],
        },
        done: true,
        doneReason: "stop",
      },
    ]);
    expect(chunks[0]?.message?.toolCalls?.[0]).not.toHaveProperty("id");
    expect(chunks[0]?.message?.toolCalls?.[0]?.function).not.toHaveProperty(
      "index",
    );
  });

  it("rejects invalid streaming tool-call metadata with an indexed path", async () => {
    const fetch = (async () =>
      streamResponse([
        `${JSON.stringify({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call-weather",
                function: { ...toolCall.function, index: -1 },
              },
            ],
          },
          done: true,
        })}\n`,
      ])) as FetchImplementation;

    await expect(
      collect(new OllamaClient({ fetch }).chatStream(toolRequest)),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaResponseError",
        message: expect.stringContaining(
          "stream[0].message.tool_calls[0].function.index: must be a non-negative safe integer",
        ),
      }),
    );
  });

  it("reports the indexed path for malformed calls", async () => {
    const fetch = (async () =>
      streamResponse([
        '{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"weather","arguments":[]}}]},"done":true}\n',
      ])) as FetchImplementation;
    await expect(
      collect(new OllamaClient({ fetch }).chatStream(toolRequest)),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OllamaResponseError",
        message: expect.stringContaining(
          "stream[0].message.tool_calls[0].function.arguments: must be a JSON object",
        ),
      }),
    );
  });

  it("still rejects data after completion and incomplete streams", async () => {
    const afterCompletion = (async () =>
      streamResponse([
        '{"done":true}\n{"done":false}\n',
      ])) as FetchImplementation;
    await expect(
      collect(
        new OllamaClient({ fetch: afterCompletion }).chatStream(toolRequest),
      ),
    ).rejects.toBeInstanceOf(OllamaResponseError);

    const incomplete = (async () =>
      streamResponse(['{"done":false}\n'])) as FetchImplementation;
    await expect(
      collect(new OllamaClient({ fetch: incomplete }).chatStream(toolRequest)),
    ).rejects.toBeInstanceOf(OllamaResponseError);
  });
});
