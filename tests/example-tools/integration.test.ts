import { AgentForge, createConversation } from "@agentforge/core";
import { registerExampleTools } from "@agentforge/example-tools";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { ScriptedCalculatorProvider } from "../../examples/tool-execution/src/ScriptedCalculatorProvider.js";
import { runToolExecutionExample } from "../../examples/tool-execution/src/runToolExecutionExample.js";

describe("tool execution example", () => {
  it("runs a deterministic two-round calculator interaction", async () => {
    const output: string[] = [];
    const { startingConversation, turn, requests, observedEvents } =
      await runToolExecutionExample((line) => output.push(line));

    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools?.map(({ name }) => name)).toEqual([
      "calculator",
      "format_text",
      "lookup_inventory",
    ]);
    expect(requests[1]?.messages.map(({ role }) => role)).toEqual([
      LLMMessageRole.User,
      LLMMessageRole.Assistant,
      LLMMessageRole.Tool,
    ]);
    const toolMessage = requests[1]?.messages.find(
      ({ role }) => role === LLMMessageRole.Tool,
    );
    expect(toolMessage).toMatchObject({
      role: LLMMessageRole.Tool,
      toolCallId: "example-call-1",
      toolName: "calculator",
      result: {
        status: "success",
        output: {
          operation: "multiply",
          left: 7,
          right: 6,
          result: 42,
        },
      },
    });
    expect(turn.providerRounds).toBe(2);
    expect(turn.toolExecutions).toHaveLength(1);
    expect(turn.toolExecutions[0]).toMatchObject({
      call: { name: "calculator" },
      result: { status: "success", output: { result: 42 } },
    });
    expect(turn.assistantMessage.content).toBe("7 multiplied by 6 is 42.");
    expect(startingConversation.messages).toEqual([]);
    expect(Object.isFrozen(startingConversation)).toBe(true);
    expect(observedEvents.map(({ type }) => type)).toEqual([
      "tool-execution-started",
      "tool-execution-completed",
    ]);
    expect(observedEvents[0]?.context).toMatchObject({
      conversationId: "tool-example-conversation",
      turnId: "turn-1",
      providerRound: 1,
      executionIndex: 1,
    });
    expect(output).toEqual([
      "Assistant: 7 multiplied by 6 is 42.",
      "Provider rounds: 2",
      "Executed tool: calculator",
      'Tool result (success): {"operation":"multiply","left":7,"right":6,"result":42}',
      "Observed event: tool-execution-started calculator turn-1 round=1 execution=1",
      "Observed event: tool-execution-completed calculator status=success",
    ]);
  });

  it("keeps registered tools out of requests until execution is enabled", async () => {
    const provider = new ScriptedCalculatorProvider();
    const agent = new AgentForge();
    registerExampleTools(agent);
    agent.registerLLMProvider(provider, { default: true });
    const engine = agent.createConversationEngine();
    await expect(
      engine.runTurn({
        conversation: createConversation({
          id: "opt-in-conversation",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        content: "Use a tool.",
        model: "scripted-tool-model",
      }),
    ).rejects.toThrow("must contain all example tools");
    expect(provider.requests[0]).not.toHaveProperty("tools");
  });
});
