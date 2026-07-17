import {
  AgentForge,
  ConversationTurnAbortedError,
  createConversation,
  createToolExecutionCompletedEvent,
  createToolExecutionEventContext,
  createToolExecutionStartedEvent,
} from "@agentforge/core";
import type {
  ConversationStreamCompletedEvent,
  ToolExecutionClock,
  ToolExecutionObserver,
  ToolExecutionObserverEvent,
} from "@agentforge/core";
import {
  LLMFinishReason,
  LLMMessageRole,
  createLLMGenerationResponse,
  createToolCall,
  healthyProvider,
  successfulToolResult,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
  LLMProviderCapabilities,
  LLMStreamingProvider,
  ToolCall,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const toolDefinition = {
  name: "calculator",
  description: "Calculate a value.",
  inputSchema: {
    type: "object",
    properties: { value: { type: "number" } },
    required: ["value"],
    additionalProperties: false,
  },
} as const;

describe("tool execution event factories", () => {
  const call = createToolCall({
    id: "call-1",
    name: "calculator",
    arguments: { value: 1 },
  });
  const context = createToolExecutionEventContext(
    {
      conversationId: "conversation-1",
      turnId: "turn-1",
      providerRound: 1,
      executionIndex: 1,
    },
    call,
  );

  it("creates deeply immutable started and completed event structures", () => {
    const started = createToolExecutionStartedEvent({
      context,
      call,
      startedAt: "2026-07-17T10:00:00.000Z",
    });
    const result = successfulToolResult(call, { value: 2 });
    const completed = createToolExecutionCompletedEvent({
      context,
      call,
      result,
      startedAt: started.startedAt,
      completedAt: "2026-07-17T10:00:01.000Z",
      durationMs: 25,
    });

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(started)).toBe(true);
    expect(Object.isFrozen(completed)).toBe(true);
    expect(Object.isFrozen(completed.call.arguments)).toBe(true);
    expect(Object.isFrozen(completed.result)).toBe(true);
    expect(completed.context).toBe(started.context);
  });

  it.each([
    [{ conversationId: "" }, "conversationId"],
    [{ turnId: " " }, "turnId"],
    [{ providerRound: 0 }, "providerRound"],
    [{ executionIndex: 0 }, "executionIndex"],
  ])("rejects invalid context %#", (override, field) => {
    expect(() =>
      createToolExecutionEventContext(
        {
          conversationId: "conversation-1",
          turnId: "turn-1",
          providerRound: 1,
          executionIndex: 1,
          ...override,
        },
        call,
      ),
    ).toThrow(field);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid duration %s",
    (durationMs) => {
      expect(() =>
        createToolExecutionCompletedEvent({
          context,
          call,
          result: successfulToolResult(call, null),
          startedAt: "2026-07-17T10:00:00.000Z",
          completedAt: "2026-07-17T10:00:01.000Z",
          durationMs,
        }),
      ).toThrow("durationMs");
    },
  );
});

describe("conversation tool execution observers", () => {
  it("emits exact immutable success events and an enriched record", async () => {
    const events: ToolExecutionObserverEvent[] = [];
    const clock = new ControlledClock();
    const provider = new QueueProvider([
      toolResponse(call("call-1")),
      textResponse("Done"),
    ]);
    const conversation = createConversation({ id: "conversation-1" });
    const agent = createAgent(provider, async ({ value }) => {
      clock.advance(25);
      return { value: Number(value) * 2 };
    });
    const result = await agent
      .createConversationEngine({
        toolExecution: { enabled: true },
        observability: { toolExecution: (event) => events.push(event), clock },
      })
      .runTurn({ conversation, content: "Calculate", model: "model" });

    expect(events.map(({ type }) => type)).toEqual([
      "tool-execution-started",
      "tool-execution-completed",
    ]);
    expect(events[0]).toMatchObject({
      context: {
        conversationId: "conversation-1",
        turnId: "turn-1",
        providerRound: 1,
        executionIndex: 1,
        toolCallId: "call-1",
        toolName: "calculator",
      },
      startedAt: "2026-07-17T10:00:00.000Z",
    });
    expect(events[1]).toMatchObject({
      result: { status: "success", output: { value: 2 } },
      durationMs: 25,
    });
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions[0]).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({ turnId: "turn-1" }),
        durationMs: 25,
      }),
    );
    expect(Object.isFrozen(result.toolExecutions[0])).toBe(true);
  });

  it("snapshots ordered observers, isolates throws, and ignores return values", async () => {
    const calls: string[] = [];
    let resolvePending: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
    const observers: ToolExecutionObserver[] = [
      (event) => calls.push(`A:${event.type}`),
      (event) => {
        calls.push(`B:${event.type}`);
        throw new Error("observer failure");
      },
      (event) => {
        calls.push(`C:${event.type}`);
        return pending;
      },
    ];
    const provider = new QueueProvider([
      toolResponse(call("call-1")),
      textResponse("Done"),
    ]);
    const agent = createAgent(provider, async () => ({ value: 2 }));
    const engine = agent.createConversationEngine({
      toolExecution: { enabled: true },
      observability: { toolExecution: observers },
    });
    observers.splice(0, observers.length);

    const result = await engine.runTurn(turn());
    expect(result.assistantMessage.content).toBe("Done");
    expect(calls).toEqual([
      "A:tool-execution-started",
      "B:tool-execution-started",
      "C:tool-execution-started",
      "A:tool-execution-completed",
      "B:tool-execution-completed",
      "C:tool-execution-completed",
    ]);
    resolvePending?.();
  });

  it("rejects malformed observer and clock configuration", () => {
    const agent = new AgentForge();
    expect(() =>
      agent.createConversationEngine({
        observability: { toolExecution: [() => {}, 42 as never] },
      }),
    ).toThrow("observability.toolExecution");
    expect(() =>
      agent.createConversationEngine({
        observability: { clock: { now: () => new Date() } as never },
      }),
    ).toThrow("observability.clock");
  });

  it("observes every structured failure without changing its code", async () => {
    const events: ToolExecutionObserverEvent[] = [];
    const provider = new QueueProvider([
      toolResponse(
        call("missing", "missing"),
        call("invalid", "calculator", {}),
        call("throws", "throws"),
        call("bad-output", "bad_output"),
      ),
      textResponse("Continued"),
    ]);
    const agent = new AgentForge();
    agent.registerLLMProvider(provider, { default: true });
    agent.registerTool(toolDefinition, async ({ value }) => ({ value }));
    agent.registerTool({ ...toolDefinition, name: "throws" }, async () => {
      throw new Error("handler failed");
    });
    agent.registerTool(
      { ...toolDefinition, name: "bad_output" },
      async () => new Date() as never,
    );
    const result = await agent
      .createConversationEngine({
        toolExecution: { enabled: true },
        observability: { toolExecution: (event) => events.push(event) },
      })
      .runTurn(turn());
    const completed = events.filter(
      (event) => event.type === "tool-execution-completed",
    );

    expect(events).toHaveLength(8);
    expect(completed.map(({ result }) => result)).toMatchObject([
      { status: "error", error: { code: "tool_not_found" } },
      { status: "error", error: { code: "invalid_arguments" } },
      { status: "error", error: { code: "tool_execution_failed" } },
      { status: "error", error: { code: "invalid_tool_output" } },
    ]);
    expect(result.assistantMessage.content).toBe("Continued");
    expect(result.toolExecutions).toHaveLength(4);
  });

  it("correlates multiple calls and rounds with one stable turn ID", async () => {
    const events: ToolExecutionObserverEvent[] = [];
    const provider = new QueueProvider([
      toolResponse(call("one"), call("two")),
      toolResponse(call("three")),
      textResponse("Done"),
    ]);
    const result = await createAgent(provider, async ({ value }) => ({ value }))
      .createConversationEngine({
        toolExecution: { enabled: true },
        observability: { toolExecution: (event) => events.push(event) },
      })
      .runTurn(turn());
    const started = events.filter(
      (event) => event.type === "tool-execution-started",
    );

    expect(started.map(({ context }) => context.turnId)).toEqual([
      "turn-1",
      "turn-1",
      "turn-1",
    ]);
    expect(started.map(({ context }) => context.providerRound)).toEqual([
      1, 1, 2,
    ]);
    expect(started.map(({ context }) => context.executionIndex)).toEqual([
      1, 2, 3,
    ]);
    expect(result.toolExecutions.map(({ call: item }) => item.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("keeps runTurn and streamTurn observability and records in parity", async () => {
    const runEvents: ToolExecutionObserverEvent[] = [];
    const streamEvents: ToolExecutionObserverEvent[] = [];
    const runResult = await createAgent(
      new QueueProvider([toolResponse(call("one")), textResponse("Done")]),
      async () => ({ value: 2 }),
    )
      .createConversationEngine({
        toolExecution: { enabled: true },
        observability: { toolExecution: (event) => runEvents.push(event) },
      })
      .runTurn(turn());
    let completed: ConversationStreamCompletedEvent | undefined;
    const stream = createAgent(
      new QueueProvider([toolResponse(call("one")), textResponse("Done")]),
      async () => ({ value: 2 }),
    ).createConversationEngine({
      toolExecution: { enabled: true },
      observability: { toolExecution: (event) => streamEvents.push(event) },
    });
    const uiEventTypes: string[] = [];
    for await (const event of stream.streamTurn(turn())) {
      uiEventTypes.push(event.type);
      if (event.type === "completed") completed = event;
    }

    expect(runEvents.map(({ type }) => type)).toEqual(
      streamEvents.map(({ type }) => type),
    );
    expect(runResult.toolExecutions[0]?.context).toEqual(
      completed?.toolExecutions[0]?.context,
    );
    expect(uiEventTypes).toEqual([
      "started",
      "tool-call-started",
      "tool-call-completed",
      "completed",
    ]);
  });

  it("emits only started when cancellation rejects execution", async () => {
    const controller = new AbortController();
    const events: ToolExecutionObserverEvent[] = [];
    const provider = new QueueProvider([
      toolResponse(call("one")),
      textResponse("unreachable"),
    ]);
    const agent = createAgent(provider, async () => ({ value: 2 }));
    await expect(
      agent
        .createConversationEngine({
          toolExecution: { enabled: true },
          observability: {
            toolExecution: (event) => {
              events.push(event);
              if (event.type === "tool-execution-started") controller.abort();
              throw new Error("observer failure");
            },
          },
        })
        .runTurn({ ...turn(), request: { signal: controller.signal } }),
    ).rejects.toBeInstanceOf(ConversationTurnAbortedError);
    expect(events.map(({ type }) => type)).toEqual(["tool-execution-started"]);
  });

  it("excludes started-observer runtime from measured duration", async () => {
    const clock = new ControlledClock();
    const provider = new QueueProvider([
      toolResponse(call("one")),
      textResponse("Done"),
    ]);
    const agent = createAgent(provider, async () => {
      clock.advance(25);
      return { value: 2 };
    });
    const result = await agent
      .createConversationEngine({
        toolExecution: { enabled: true },
        observability: {
          clock,
          toolExecution: (event) => {
            if (event.type === "tool-execution-started") clock.advance(100);
          },
        },
      })
      .runTurn(turn());
    expect(result.toolExecutions[0]?.durationMs).toBe(25);
  });

  it("allocates unique engine-scoped turn IDs", async () => {
    const events: ToolExecutionObserverEvent[] = [];
    const provider = new QueueProvider([
      toolResponse(call("one")),
      textResponse("Done"),
      toolResponse(call("two")),
      textResponse("Done again"),
    ]);
    const engine = createAgent(provider, async () => ({
      value: 2,
    })).createConversationEngine({
      toolExecution: { enabled: true },
      observability: { toolExecution: (event) => events.push(event) },
    });
    await engine.runTurn(turn());
    await engine.runTurn(turn());
    expect(
      events
        .filter((event) => event.type === "tool-execution-started")
        .map(({ context }) => context.turnId),
    ).toEqual(["turn-1", "turn-2"]);
  });

  it("allocates concurrent turn IDs before completion order is known", async () => {
    const events: ToolExecutionObserverEvent[] = [];
    const provider = new ConcurrentProvider();
    const agent = new AgentForge();
    agent.registerLLMProvider(provider, { default: true });
    agent.registerTool(toolDefinition, async ({ value }) => ({ value }));
    const engine = agent.createConversationEngine({
      toolExecution: { enabled: true },
      observability: { toolExecution: (event) => events.push(event) },
    });
    const first = engine.runTurn({ ...turn(), content: "first" });
    const second = engine.runTurn({ ...turn(), content: "second" });
    provider.resolve("second", toolResponse(call("second-call")));
    provider.resolve("first", toolResponse(call("first-call")));
    await Promise.all([first, second]);
    const started = events.filter(
      (event) => event.type === "tool-execution-started",
    );

    expect(started.map(({ context }) => context)).toEqual([
      expect.objectContaining({ toolCallId: "second-call", turnId: "turn-2" }),
      expect.objectContaining({ toolCallId: "first-call", turnId: "turn-1" }),
    ]);
    expect(started.map(({ context }) => context.executionIndex)).toEqual([
      1, 1,
    ]);
  });
});

describe("tool execution observer redaction", () => {
  it("redacts one shared event without changing execution or persistence", async () => {
    const firstObserver: ToolExecutionObserverEvent[] = [];
    const secondObserver: ToolExecutionObserverEvent[] = [];
    const redactionPhases: string[] = [];
    let handlerArguments: Record<string, unknown> | undefined;
    const provider = new QueueProvider([
      toolResponse(call("secret-call", "calculator", { value: 123 })),
      textResponse("Done"),
    ]);
    const agent = createAgent(provider, async (argumentsValue) => {
      handlerArguments = argumentsValue;
      return { secret: "output" };
    });

    const result = await agent
      .createConversationEngine({
        toolExecution: { enabled: true },
        observability: {
          toolExecution: [
            (event) => firstObserver.push(event),
            (event) => secondObserver.push(event),
          ],
          redactor: {
            redactArguments(argumentsValue, context) {
              expect(Object.isFrozen(argumentsValue)).toBe(true);
              expect(Object.isFrozen(context)).toBe(true);
              redactionPhases.push(`arguments:${context.phase}`);
              return { value: "[REDACTED]" };
            },
            redactResult(toolResult, context) {
              expect(Object.isFrozen(toolResult)).toBe(true);
              expect(Object.isFrozen(context)).toBe(true);
              redactionPhases.push(`result:${context.phase}`);
              return toolResult.status === "success"
                ? successfulToolResult(
                    createToolCall({
                      id: toolResult.toolCallId,
                      name: toolResult.toolName,
                      arguments: {},
                    }),
                    { secret: "[REDACTED]" },
                  )
                : toolResult;
            },
          },
        },
      })
      .runTurn({
        conversation: createConversation({ id: "redaction-conversation" }),
        content: "Use a secret",
        model: "model",
      });

    expect(redactionPhases).toEqual([
      "arguments:started",
      "arguments:completed",
      "result:completed",
    ]);
    expect(secondObserver[0]).toBe(firstObserver[0]);
    expect(secondObserver[1]).toBe(firstObserver[1]);
    expect(firstObserver[0]?.call.arguments).toEqual({
      value: "[REDACTED]",
    });
    expect(firstObserver[1]).toMatchObject({
      call: { arguments: { value: "[REDACTED]" } },
      result: { status: "success", output: { secret: "[REDACTED]" } },
    });
    expect(Object.isFrozen(firstObserver[1])).toBe(true);
    expect(Object.isFrozen(firstObserver[0]?.call.arguments)).toBe(true);
    const redactedCompleted = firstObserver[1];
    if (redactedCompleted?.type !== "tool-execution-completed") {
      throw new Error("Missing completed observer event.");
    }
    expect(Object.isFrozen(redactedCompleted.result)).toBe(true);
    expect(
      redactedCompleted.result.status === "success" &&
        Object.isFrozen(redactedCompleted.result.output),
    ).toBe(true);
    expect(handlerArguments).toEqual({ value: 123 });
    expect(result.toolExecutions[0]?.call.arguments).toEqual({ value: 123 });
    expect(result.toolExecutions[0]?.result).toMatchObject({
      status: "success",
      output: { secret: "output" },
    });
    const persistedToolMessage = result.conversation.messages.find(
      ({ role }) => role === LLMMessageRole.Tool,
    );
    expect(persistedToolMessage).toMatchObject({
      result: { status: "success", output: { secret: "output" } },
    });
  });

  it.each([
    [
      "a thrown error",
      () => {
        throw new Error("redactor failed");
      },
    ],
    ["invalid JSON", () => ({ secret: undefined }) as never],
    ["a promise", () => Promise.resolve({ secret: "leaked" }) as never],
    [
      "an input mutation",
      (argumentsValue: Readonly<Record<string, unknown>>) => {
        (argumentsValue as { value: number }).value = 999;
        return argumentsValue;
      },
    ],
  ])(
    "uses an empty argument fallback for %s",
    async (_label, redactArguments) => {
      const events: ToolExecutionObserverEvent[] = [];
      const provider = new QueueProvider([
        toolResponse(call("call-1", "calculator", { value: 1 })),
        textResponse("Done"),
      ]);
      const agent = createAgent(provider, async () => ({ secret: "output" }));

      await agent
        .createConversationEngine({
          toolExecution: { enabled: true },
          observability: {
            toolExecution: (event) => events.push(event),
            redactor: { redactArguments },
          },
        })
        .runTurn(turn());

      expect(events).toHaveLength(2);
      expect(events[0]?.call.arguments).toEqual({});
      expect(events[1]?.call.arguments).toEqual({});
    },
  );

  it.each([
    [
      "throws",
      () => {
        throw new Error("redactor failed");
      },
    ],
    ["returns invalid data", () => ({}) as never],
    ["returns a promise", () => Promise.resolve({}) as never],
  ])(
    "uses a non-sensitive result fallback when redaction %s",
    async (_label, redactResult) => {
      const events: ToolExecutionObserverEvent[] = [];
      const laterEvents: ToolExecutionObserverEvent[] = [];
      const provider = new QueueProvider([
        toolResponse(call("call-1")),
        textResponse("Done"),
      ]);
      const agent = createAgent(provider, async () => ({ secret: "output" }));

      await agent
        .createConversationEngine({
          toolExecution: { enabled: true },
          observability: {
            toolExecution: [
              (event) => events.push(event),
              (event) => laterEvents.push(event),
            ],
            redactor: { redactResult },
          },
        })
        .runTurn(turn());

      expect(events[1]).toMatchObject({
        result: { status: "success", output: null },
      });
      expect(laterEvents[1]).toBe(events[1]);
    },
  );
});

class ControlledClock implements ToolExecutionClock {
  private elapsed = 0;

  now(): Date {
    return new Date(Date.parse("2026-07-17T10:00:00.000Z") + this.elapsed);
  }

  monotonicNow(): number {
    return this.elapsed;
  }

  advance(milliseconds: number): void {
    this.elapsed += milliseconds;
  }
}

class QueueProvider implements LLMStreamingProvider {
  readonly metadata = Object.freeze({ name: "queue", version: "1.0.0" });
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: true,
    tools: true,
  });
  readonly requests: LLMGenerationRequest[] = [];

  constructor(private readonly responses: LLMGenerationResponse[]) {}

  async checkHealth() {
    return healthyProvider();
  }

  async generate(request: LLMGenerationRequest) {
    this.requests.push(request);
    return this.takeResponse();
  }

  async *stream(request: LLMGenerationRequest) {
    this.requests.push(request);
    yield { type: "completed", response: this.takeResponse() } as const;
  }

  private takeResponse(): LLMGenerationResponse {
    const response = this.responses.shift();
    if (response === undefined) throw new Error("No queued response.");
    return response;
  }
}

class ConcurrentProvider implements LLMProvider {
  readonly metadata = Object.freeze({ name: "concurrent", version: "1.0.0" });
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: false,
    tools: true,
  });
  private readonly pending = new Map<
    string,
    (response: LLMGenerationResponse) => void
  >();

  async checkHealth() {
    return healthyProvider();
  }

  generate(request: LLMGenerationRequest): Promise<LLMGenerationResponse> {
    if (request.messages.some(({ role }) => role === LLMMessageRole.Tool)) {
      return Promise.resolve(textResponse("Done"));
    }
    const user = request.messages.find(
      ({ role }) => role === LLMMessageRole.User,
    );
    return new Promise((resolve) => {
      this.pending.set(user?.content ?? "", resolve);
    });
  }

  resolve(content: string, response: LLMGenerationResponse): void {
    const resolve = this.pending.get(content);
    if (resolve === undefined)
      throw new Error(`No pending turn for ${content}.`);
    this.pending.delete(content);
    resolve(response);
  }
}

function createAgent(
  provider: QueueProvider,
  handler: (argumentsValue: Record<string, unknown>) => Promise<unknown>,
): AgentForge {
  const agent = new AgentForge();
  agent.registerLLMProvider(provider, { default: true });
  agent.registerTool(toolDefinition, handler as never);
  return agent;
}

function call(
  id: string,
  name = "calculator",
  argumentsValue: ToolCall["arguments"] = { value: 1 },
): ToolCall {
  return createToolCall({ id, name, arguments: argumentsValue });
}

function toolResponse(...calls: ToolCall[]): LLMGenerationResponse {
  return createLLMGenerationResponse({
    model: "model",
    message: {
      role: LLMMessageRole.Assistant,
      content: "",
      toolCalls: calls,
    },
    finishReason: LLMFinishReason.ToolCalls,
  });
}

function textResponse(content: string): LLMGenerationResponse {
  return createLLMGenerationResponse({
    model: "model",
    message: { role: LLMMessageRole.Assistant, content },
    finishReason: LLMFinishReason.Stop,
  });
}

function turn() {
  return {
    conversation: createConversation({ id: "conversation-1" }),
    content: "Use tools",
    model: "model",
  };
}
