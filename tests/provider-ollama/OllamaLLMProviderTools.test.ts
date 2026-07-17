import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaRequestOptions,
} from "@agentforge/ollama-client";
import { OllamaLLMProvider } from "@agentforge/provider-ollama";
import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderRequestError,
  ProviderResponseError,
  createToolCall,
  createToolDefinition,
  createToolResult,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMStreamEvent,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { OllamaGenerationSequenceAllocator } from "../../packages/provider-ollama/src/internal/OllamaGenerationSequenceAllocator.js";
import { mapToolDefinition } from "../../packages/provider-ollama/src/internal/mapGenerationRequest.js";
import { FakeOllamaClient, asOllamaClient } from "./testUtils.js";

const weatherDefinition = createToolDefinition({
  name: "weather",
  description: "Get the weather.",
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name." },
      units: {
        type: "array",
        items: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
    },
    required: ["city"],
    additionalProperties: false,
  },
});

const clockDefinition = createToolDefinition({
  name: "clock",
  description: "Get the time.",
  inputSchema: { type: "object", additionalProperties: false },
});

const baseRequest: LLMGenerationRequest = {
  model: "tool-model",
  messages: [{ role: LLMMessageRole.User, content: "Weather?" }],
  tools: [weatherDefinition],
};

function toolResponse(
  calls: readonly {
    readonly function: {
      readonly name: string;
      readonly arguments: Readonly<Record<string, never | string | object>>;
    };
  }[],
  content = "",
): OllamaChatResponse {
  return {
    model: "tool-model",
    message: { role: "assistant", content, toolCalls: calls as never },
    done: true,
    doneReason: "stop",
    promptEvalCount: 8,
    evalCount: 3,
  };
}

function getCompletedResponse(
  events: readonly LLMStreamEvent[],
): Readonly<LLMGenerationResponse> {
  const event = events.find(({ type }) => type === "completed");
  if (event?.type !== "completed") throw new Error("Missing completion.");
  return event.response;
}

async function collect(
  source: AsyncIterable<LLMStreamEvent>,
): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

describe("OllamaLLMProvider tool capability", () => {
  it("advertises immutable streaming and tool support", () => {
    const provider = new OllamaLLMProvider({
      client: asOllamaClient(new FakeOllamaClient()),
    });
    expect(provider.capabilities).toEqual({ streaming: true, tools: true });
    expect(Object.isFrozen(provider.capabilities)).toBe(true);
  });
});

describe("OllamaLLMProvider tool request mapping", () => {
  it("maps definitions in order and deeply copies nested schemas", async () => {
    const client = new FakeOllamaClient();
    const request = {
      ...baseRequest,
      tools: [weatherDefinition, clockDefinition],
    };
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
      request,
    );

    const tools = client.chatCalls[0]?.request.tools;
    expect(tools).toEqual([
      {
        type: "function",
        function: {
          name: "weather",
          description: "Get the weather.",
          parameters: weatherDefinition.inputSchema,
        },
      },
      {
        type: "function",
        function: {
          name: "clock",
          description: "Get the time.",
          parameters: clockDefinition.inputSchema,
        },
      },
    ]);
    expect(tools?.[0]?.function.parameters).not.toBe(
      weatherDefinition.inputSchema,
    );
    expect(Object.isFrozen(tools)).toBe(true);
    expect(Object.isFrozen(tools?.[0]?.function.parameters.properties)).toBe(
      true,
    );
    expect(request).toEqual({
      ...baseRequest,
      tools: [weatherDefinition, clockDefinition],
    });
  });

  it("omits an absent description in the dedicated mapper", () => {
    expect(
      mapToolDefinition({
        name: "minimal",
        inputSchema: { type: "object" },
      } as never),
    ).toEqual({
      type: "function",
      function: { name: "minimal", parameters: { type: "object" } },
    });
  });

  it("maps assistant calls and tool results without provider-neutral metadata", async () => {
    const client = new FakeOllamaClient();
    const call1 = createToolCall({
      id: "provider-call-1",
      name: "weather",
      arguments: { city: "Warsaw" },
    });
    const call2 = createToolCall({
      id: "provider-call-2",
      name: "clock",
      arguments: {},
    });
    const result = createToolResult({
      toolCallId: call1.id,
      toolName: call1.name,
      status: "success",
      output: { temperature: 21 },
    });
    const request: LLMGenerationRequest = {
      ...baseRequest,
      messages: [
        ...baseRequest.messages,
        {
          role: LLMMessageRole.Assistant,
          content: "",
          toolCalls: [call1, call2],
        },
        {
          role: LLMMessageRole.Tool,
          toolCallId: call1.id,
          toolName: call1.name,
          content: '{"temperature":21}',
          result,
        },
      ],
      generation: { temperature: 0.2, stop: ["END"] },
      request: { timeoutMs: 5_000 },
    };
    await new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
      request,
    );

    expect(client.chatCalls[0]).toEqual({
      request: {
        model: "tool-model",
        messages: [
          { role: "user", content: "Weather?" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                function: {
                  name: "weather",
                  arguments: { city: "Warsaw" },
                },
              },
              { function: { name: "clock", arguments: {} } },
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
              parameters: weatherDefinition.inputSchema,
            },
          },
        ],
        options: { temperature: 0.2, stop: ["END"] },
      },
      options: { timeoutMs: 5_000 },
    });
    expect(JSON.stringify(client.chatCalls[0]?.request)).not.toContain(
      "provider-call",
    );
  });
});

describe("OllamaLLMProvider complete tool responses", () => {
  it("maps ordered calls, IDs, Unicode, usage, and immutability", async () => {
    const client = new FakeOllamaClient();
    client.chatResult = toolResponse([
      {
        function: {
          name: "weather",
          arguments: { city: "Łódź", nested: { units: ["°C"] } },
        },
      },
      { function: { name: "clock", arguments: {} } },
    ]);
    const response = await new OllamaLLMProvider({
      client: asOllamaClient(client),
    }).generate(baseRequest);

    expect(response).toEqual({
      model: "tool-model",
      message: {
        role: LLMMessageRole.Assistant,
        content: "",
        toolCalls: [
          {
            id: "ollama-1-call-1",
            name: "weather",
            arguments: { city: "Łódź", nested: { units: ["°C"] } },
          },
          { id: "ollama-1-call-2", name: "clock", arguments: {} },
        ],
      },
      finishReason: LLMFinishReason.ToolCalls,
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
    });
    const message = response.message as typeof response.message & {
      toolCalls: readonly Readonly<ReturnType<typeof createToolCall>>[];
    };
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(message)).toBe(true);
    expect(Object.isFrozen(message.toolCalls)).toBe(true);
    expect(Object.isFrozen(message.toolCalls[0]?.arguments.nested)).toBe(true);
  });

  it("uses distinct invocation sequences", async () => {
    const client = new FakeOllamaClient();
    client.chatResult = toolResponse([
      { function: { name: "weather", arguments: { city: "Warsaw" } } },
    ]);
    const provider = new OllamaLLMProvider({ client: asOllamaClient(client) });
    const first = await provider.generate(baseRequest);
    const second = await provider.generate(baseRequest);
    expect("toolCalls" in first.message && first.message.toolCalls[0]?.id).toBe(
      "ollama-1-call-1",
    );
    expect(
      "toolCalls" in second.message && second.message.toolCalls[0]?.id,
    ).toBe("ollama-2-call-1");
  });

  it("rejects assistant text together with calls", async () => {
    const client = new FakeOllamaClient();
    client.chatResult = toolResponse(
      [{ function: { name: "weather", arguments: {} } }],
      "I will call a tool.",
    );
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
        baseRequest,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderResponseError",
        message:
          'Provider "ollama" returned assistant text together with tool calls.',
      }),
    );
    await expect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
        baseRequest,
      ),
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it("classifies invalid provider tool-call data as a response error", async () => {
    const client = new FakeOllamaClient();
    client.chatResult = toolResponse([
      { function: { name: "", arguments: { secret: "must-not-leak" } } },
    ]);
    const generate = () =>
      new OllamaLLMProvider({ client: asOllamaClient(client) }).generate(
        baseRequest,
      );

    await expect(generate()).rejects.toMatchObject({
      name: "ProviderResponseError",
      providerName: "ollama",
      message: 'Provider "ollama" returned invalid tool call data.',
    });
    await expect(generate()).rejects.toBeInstanceOf(ProviderResponseError);
    await expect(generate()).rejects.not.toBeInstanceOf(ProviderRequestError);
    await expect(generate()).rejects.not.toHaveProperty(
      "message",
      expect.stringContaining("must-not-leak"),
    );
  });
});

describe("OllamaLLMProvider concurrent call IDs", () => {
  it("allocates before I/O so completion order cannot duplicate IDs", async () => {
    class DeferredClient extends FakeOllamaClient {
      readonly resolvers: ((value: OllamaChatResponse) => void)[] = [];

      override chat(
        request: OllamaChatRequest,
        options?: OllamaRequestOptions,
      ): Promise<OllamaChatResponse> {
        this.chatCalls.push({ request, options });
        return new Promise((resolve) => this.resolvers.push(resolve));
      }
    }

    const client = new DeferredClient();
    const provider = new OllamaLLMProvider({ client: asOllamaClient(client) });
    const firstPromise = provider.generate(baseRequest);
    const secondPromise = provider.generate(baseRequest);
    expect(client.resolvers).toHaveLength(2);
    client.resolvers[1]?.(
      toolResponse([{ function: { name: "clock", arguments: {} } }]),
    );
    client.resolvers[0]?.(
      toolResponse([{ function: { name: "weather", arguments: {} } }]),
    );
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect("toolCalls" in first.message && first.message.toolCalls[0]?.id).toBe(
      "ollama-1-call-1",
    );
    expect(
      "toolCalls" in second.message && second.message.toolCalls[0]?.id,
    ).toBe("ollama-2-call-1");
  });
});

describe("Ollama generation sequence exhaustion", () => {
  it("allocates MAX_SAFE_INTEGER once and then fails without wrapping", () => {
    const allocator = new OllamaGenerationSequenceAllocator(
      "ollama",
      Number.MAX_SAFE_INTEGER,
    );
    expect(allocator.allocate()).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => allocator.allocate()).toThrow(ProviderRequestError);
    expect(() => allocator.allocate()).toThrow(
      "generation sequence is exhausted",
    );
  });
});

describe("OllamaLLMProvider streaming tool calls", () => {
  it("aggregates complete calls without deltas, deduplication, or merging", async () => {
    const client = new FakeOllamaClient();
    const duplicate = {
      function: { name: "weather", arguments: { city: "Warsaw" } },
    } as const;
    client.streamResult = [
      {
        model: "tool-model",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [duplicate, duplicate],
        },
        done: false,
      },
      {
        model: "tool-model",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              function: { name: "clock", arguments: { zone: "Europe/Warsaw" } },
            },
          ],
        },
        done: true,
        doneReason: "stop",
        promptEvalCount: 9,
        evalCount: 2,
      },
    ];
    const events = await collect(
      new OllamaLLMProvider({ client: asOllamaClient(client) }).stream(
        baseRequest,
      ),
    );
    expect(events.map(({ type }) => type)).toEqual(["completed"]);
    expect(getCompletedResponse(events)).toEqual({
      model: "tool-model",
      message: {
        role: LLMMessageRole.Assistant,
        content: "",
        toolCalls: [
          {
            id: "ollama-1-call-1",
            name: "weather",
            arguments: { city: "Warsaw" },
          },
          {
            id: "ollama-1-call-2",
            name: "weather",
            arguments: { city: "Warsaw" },
          },
          {
            id: "ollama-1-call-3",
            name: "clock",
            arguments: { zone: "Europe/Warsaw" },
          },
        ],
      },
      finishReason: LLMFinishReason.ToolCalls,
      usage: { inputTokens: 9, outputTokens: 2, totalTokens: 11 },
    });
  });

  it.each([
    [
      [
        {
          message: { role: "assistant", content: "text" },
          done: false,
        },
        {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ function: { name: "weather", arguments: {} } }],
          },
          done: true,
        },
      ],
      "returned tool calls after assistant text",
    ],
    [
      [
        {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ function: { name: "weather", arguments: {} } }],
          },
          done: false,
        },
        {
          message: { role: "assistant", content: "text" },
          done: true,
        },
      ],
      "returned assistant text after tool calls",
    ],
    [
      [
        {
          message: {
            role: "assistant",
            content: "text",
            toolCalls: [{ function: { name: "weather", arguments: {} } }],
          },
          done: true,
        },
      ],
      "returned assistant text together with tool calls",
    ],
  ])("rejects mixed streaming protocol %#", async (streamResult, detail) => {
    const client = new FakeOllamaClient();
    client.streamResult = streamResult as never;
    await expect(
      collect(
        new OllamaLLMProvider({ client: asOllamaClient(client) }).stream(
          baseRequest,
        ),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderResponseError",
        message: expect.stringContaining(detail),
      }),
    );
    await expect(
      collect(
        new OllamaLLMProvider({ client: asOllamaClient(client) }).stream(
          baseRequest,
        ),
      ),
    ).rejects.toBeInstanceOf(ProviderResponseError);
    await expect(
      collect(
        new OllamaLLMProvider({ client: asOllamaClient(client) }).stream(
          baseRequest,
        ),
      ),
    ).rejects.not.toBeInstanceOf(ProviderRequestError);
  });
});
