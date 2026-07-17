import {
  AgentForge,
  ConversationProviderToolsUnsupportedError,
  ConversationToolProtocolError,
  ConversationToolRoundLimitError,
  ConversationTurnAbortedError,
  createConversation,
  createConversationEngine,
} from "@agentforge/core";
import {
  LLMFinishReason,
  LLMMessageRole,
  healthyProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
  LLMProviderCapabilities,
  LLMStreamEvent,
  LLMStreamingProvider,
  ToolCall,
  ToolHandler,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { ToolRegistryImpl } from "../../../packages/core/src/tools/ToolRegistryImpl.js";

const finalResponse = (content = "Done"): LLMGenerationResponse => ({
  model: "model",
  finishReason: LLMFinishReason.Stop,
  message: { role: LLMMessageRole.Assistant, content },
});

const toolResponse = (...calls: ToolCall[]): LLMGenerationResponse => ({
  model: "model",
  finishReason: LLMFinishReason.ToolCalls,
  message: { role: LLMMessageRole.Assistant, content: "", toolCalls: calls },
});

const call = (id: string, name = "first", argumentsValue = {}): ToolCall => ({
  id,
  name,
  arguments: argumentsValue,
});

function registry(entries: readonly [string, ToolHandler][]) {
  const value = new ToolRegistryImpl();
  for (const [name, handler] of entries) {
    value.register(
      {
        name,
        description: `${name} tool.`,
        inputSchema: { type: "object", additionalProperties: true },
      },
      handler,
    );
  }
  return value;
}

class QueueProvider implements LLMProvider {
  readonly metadata = Object.freeze({ name: "queue", version: "1.0.0" });
  readonly capabilities: Readonly<LLMProviderCapabilities>;
  readonly requests: LLMGenerationRequest[] = [];

  constructor(
    private readonly responses: LLMGenerationResponse[],
    tools = true,
  ) {
    this.capabilities = Object.freeze({ streaming: false, tools });
  }

  async checkHealth() {
    return healthyProvider();
  }
  async generate(request: LLMGenerationRequest) {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("No queued response.");
    return response;
  }
}

class QueueStreamingProvider
  extends QueueProvider
  implements LLMStreamingProvider
{
  override readonly capabilities = Object.freeze({
    streaming: true,
    tools: true,
  });
  constructor(private readonly rounds: readonly (readonly LLMStreamEvent[])[]) {
    super([], true);
  }
  async *stream(request: LLMGenerationRequest) {
    this.requests.push(request);
    const events = this.rounds[this.requests.length - 1] ?? [];
    for (const event of events) yield event;
  }
}

function engine(
  provider: LLMProvider,
  tools?: ToolRegistryImpl,
  toolExecution: { enabled?: boolean; maxRounds?: number } = {},
) {
  return createConversationEngine({
    providers: {
      getLLMProvider: (name) =>
        name === provider.metadata.name ? provider : undefined,
      getDefaultLLMProvider: () => provider,
    },
    ...(tools === undefined ? {} : { tools: tools.getView() }),
    toolExecution,
  });
}

const turn = () => ({
  conversation: createConversation(),
  content: "Use tools",
  model: "model",
});

describe("ConversationEngine tool loop", () => {
  it.each([
    [{ enabled: "yes" }, "toolExecution.enabled"],
    [{ maxRounds: 0 }, "toolExecution.maxRounds"],
    [{ maxRounds: 33 }, "toolExecution.maxRounds"],
    [{ metadata: { invalid: new Date() } }, "toolExecution.metadata"],
  ])("rejects invalid tool execution options %#", (toolExecution, detail) => {
    const provider = new QueueProvider([finalResponse()]);
    expect(() =>
      createConversationEngine({
        providers: {
          getLLMProvider: () => provider,
          getDefaultLLMProvider: () => provider,
        },
        toolExecution: toolExecution as never,
      }),
    ).toThrow(
      expect.objectContaining({ message: expect.stringContaining(detail) }),
    );
  });

  it("uses the AgentForge registry view for explicitly enabled engines", async () => {
    const provider = new QueueProvider([
      toolResponse(call("one", "registered")),
      finalResponse(),
    ]);
    const agent = new AgentForge()
      .registerLLMProvider(provider, { default: true })
      .registerTool(
        {
          name: "registered",
          description: "Registered tool.",
          inputSchema: { type: "object" },
        },
        async () => "ok",
      );
    const result = await agent
      .createConversationEngine({ toolExecution: { enabled: true } })
      .runTurn(turn());
    expect(result.toolExecutions).toHaveLength(1);
    expect(provider.requests[0]?.tools?.[0]?.name).toBe("registered");
  });

  it("keeps tools disabled by default and preserves one provider round", async () => {
    const provider = new QueueProvider([finalResponse()], false);
    const result = await engine(
      provider,
      registry([["first", async () => null]]),
    ).runTurn(turn());
    expect(provider.requests[0]).not.toHaveProperty("tools");
    expect(result.providerRounds).toBe(1);
    expect(result.toolExecutions).toEqual([]);
  });

  it("fails before provider execution when enabled tools are unsupported", async () => {
    const provider = new QueueProvider([finalResponse()], false);
    await expect(
      engine(provider, registry([["first", async () => null]]), {
        enabled: true,
      }).runTurn(turn()),
    ).rejects.toBeInstanceOf(ConversationProviderToolsUnsupportedError);
    expect(provider.requests).toEqual([]);
  });

  it("executes a tool round and returns a final immutable result", async () => {
    const provider = new QueueProvider([
      toolResponse(call("one")),
      finalResponse("Answer"),
    ]);
    const tools = registry([["first", async () => ({ value: 1 })]]);
    const result = await engine(provider, tools, { enabled: true }).runTurn(
      turn(),
    );
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]?.tools?.map(({ name }) => name)).toEqual([
      "first",
    ]);
    expect(provider.requests[1]?.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(result.providerRounds).toBe(2);
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.assistantMessage.content).toBe("Answer");
    expect(result.conversation.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(Object.isFrozen(result.toolExecutions)).toBe(true);
  });

  it("selects definitions in registry order rather than caller order", async () => {
    const provider = new QueueProvider([finalResponse()]);
    const tools = registry([
      ["first", async () => null],
      ["second", async () => null],
      ["third", async () => null],
    ]);
    await engine(provider, tools).runTurn({
      ...turn(),
      tools: ["third", "first"],
    });
    expect(provider.requests[0]?.tools?.map(({ name }) => name)).toEqual([
      "first",
      "third",
    ]);
  });

  it("rejects an unknown selected tool before provider execution", async () => {
    const provider = new QueueProvider([finalResponse()]);
    await expect(
      engine(provider, registry([["first", async () => null]])).runTurn({
        ...turn(),
        tools: ["missing"],
      }),
    ).rejects.toMatchObject({ name: "InvalidConversationTurnError" });
    expect(provider.requests).toEqual([]);
  });

  it("executes multiple calls sequentially and continues after a normal failure", async () => {
    const order: string[] = [];
    const provider = new QueueProvider([
      toolResponse(
        call("a", "first"),
        call("b", "missing"),
        call("c", "second"),
      ),
      finalResponse(),
    ]);
    const tools = registry([
      [
        "first",
        async () => {
          order.push("first");
          return 1;
        },
      ],
      [
        "second",
        async () => {
          order.push("second");
          return 2;
        },
      ],
    ]);
    const result = await engine(provider, tools, { enabled: true }).runTurn(
      turn(),
    );
    expect(order).toEqual(["first", "second"]);
    expect(
      result.toolExecutions.map(({ result: item }) => item.status),
    ).toEqual(["success", "error", "success"]);
    expect(
      provider.requests[1]?.messages.filter(({ role }) => role === "tool"),
    ).toHaveLength(3);
  });

  it("rejects reused call IDs across rounds before executing twice", async () => {
    let executions = 0;
    const provider = new QueueProvider([
      toolResponse(call("same")),
      toolResponse(call("same")),
    ]);
    const tools = registry([
      [
        "first",
        async () => {
          executions += 1;
          return null;
        },
      ],
    ]);
    await expect(
      engine(provider, tools, { enabled: true }).runTurn(turn()),
    ).rejects.toBeInstanceOf(ConversationToolProtocolError);
    expect(executions).toBe(1);
  });

  it("supports multiple tool rounds before the final answer", async () => {
    const provider = new QueueProvider([
      toolResponse(call("one")),
      toolResponse(call("two")),
      finalResponse(),
    ]);
    const result = await engine(
      provider,
      registry([["first", async () => null]]),
      { enabled: true },
    ).runTurn(turn());
    expect(result.providerRounds).toBe(3);
    expect(result.toolExecutions.map(({ call: item }) => item.id)).toEqual([
      "one",
      "two",
    ]);
  });

  it("enforces the provider-round limit without mutating the source", async () => {
    const source = createConversation();
    const provider = new QueueProvider([
      toolResponse(call("one")),
      toolResponse(call("two")),
    ]);
    const tools = registry([["first", async () => null]]);
    await expect(
      engine(provider, tools, { enabled: true, maxRounds: 2 }).runTurn({
        ...turn(),
        conversation: source,
      }),
    ).rejects.toBeInstanceOf(ConversationToolRoundLimitError);
    expect(provider.requests).toHaveLength(2);
    expect(source.messages).toEqual([]);
  });

  it("aborts the entire turn during tool execution", async () => {
    const controller = new AbortController();
    const provider = new QueueProvider([
      toolResponse(call("one")),
      finalResponse(),
    ]);
    const tools = registry([
      [
        "first",
        async () => {
          controller.abort("stop");
          return null;
        },
      ],
    ]);
    await expect(
      engine(provider, tools, { enabled: true }).runTurn({
        ...turn(),
        request: { signal: controller.signal },
      }),
    ).rejects.toBeInstanceOf(ConversationTurnAbortedError);
    expect(provider.requests).toHaveLength(1);
  });
});

describe("ConversationEngine streaming tool loop", () => {
  it("emits ordered tool events followed by final deltas and completion", async () => {
    const provider = new QueueStreamingProvider([
      [{ type: "completed", response: toolResponse(call("one")) }],
      [
        { type: "delta", model: "model", delta: "Done" },
        { type: "completed", response: finalResponse("Done") },
      ],
    ]);
    const events = [];
    for await (const event of engine(
      provider,
      registry([["first", async () => 1]]),
      { enabled: true },
    ).streamTurn(turn()))
      events.push(event);
    expect(events.map(({ type }) => type)).toEqual([
      "started",
      "tool-call-started",
      "tool-call-completed",
      "delta",
      "completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      providerRounds: 2,
      toolExecutions: [{ call: { id: "one" } }],
    });
  });

  it("rejects text deltas in a tool-call round without emitting completion", async () => {
    const provider = new QueueStreamingProvider([
      [
        { type: "delta", model: "model", delta: "thinking" },
        { type: "completed", response: toolResponse(call("one")) },
      ],
    ]);
    const types: string[] = [];
    await expect(async () => {
      for await (const event of engine(
        provider,
        registry([["first", async () => 1]]),
        { enabled: true },
      ).streamTurn(turn()))
        types.push(event.type);
    }).rejects.toBeInstanceOf(ConversationToolProtocolError);
    expect(types).not.toContain("completed");
  });

  it("stops streaming without completion when a tool aborts the turn", async () => {
    const controller = new AbortController();
    const provider = new QueueStreamingProvider([
      [{ type: "completed", response: toolResponse(call("one")) }],
    ]);
    const types: string[] = [];
    await expect(async () => {
      for await (const event of engine(
        provider,
        registry([
          [
            "first",
            async () => {
              controller.abort("cancel tool");
              return null;
            },
          ],
        ]),
        { enabled: true },
      ).streamTurn({ ...turn(), request: { signal: controller.signal } })) {
        types.push(event.type);
      }
    }).rejects.toBeInstanceOf(ConversationTurnAbortedError);
    expect(types).toEqual(["started", "tool-call-started"]);
  });
});
