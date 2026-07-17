import {
  AgentForge,
  AgentForgeState,
  type Conversation,
  type ConversationTurnResult,
  createConversation,
} from "@agentforge/core";
import { registerExampleTools } from "@agentforge/example-tools";
import type { LLMGenerationRequest } from "@agentforge/provider-sdk";
import { ScriptedCalculatorProvider } from "./ScriptedCalculatorProvider.js";

export interface ToolExecutionExampleResult {
  readonly startingConversation: Readonly<Conversation>;
  readonly turn: Readonly<ConversationTurnResult>;
  readonly requests: readonly LLMGenerationRequest[];
}

export async function runToolExecutionExample(
  writeLine: (line: string) => void = console.log,
): Promise<Readonly<ToolExecutionExampleResult>> {
  const provider = new ScriptedCalculatorProvider();
  const agent = new AgentForge();
  registerExampleTools(agent);
  agent.registerLLMProvider(provider, { default: true });
  await agent.start();

  try {
    let nextId = 1;
    const engine = agent.createConversationEngine({
      conversationFactory: {
        idGenerator: () => `tool-example-message-${nextId++}`,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
      toolExecution: { enabled: true },
    });
    const startingConversation = createConversation({
      id: "tool-example-conversation",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const turn = await engine.runTurn({
      conversation: startingConversation,
      content: "What is 7 multiplied by 6?",
      model: "scripted-tool-model",
    });
    const execution = turn.toolExecutions[0];
    if (execution === undefined) {
      throw new Error("The calculator was not executed.");
    }

    writeLine(`Assistant: ${turn.assistantMessage.content}`);
    writeLine(`Provider rounds: ${turn.providerRounds}`);
    writeLine(`Executed tool: ${execution.call.name}`);
    writeLine(
      `Tool result (${execution.result.status}): ${
        execution.result.status === "success"
          ? JSON.stringify(execution.result.output)
          : execution.result.error.message
      }`,
    );

    return Object.freeze({
      startingConversation,
      turn,
      requests: Object.freeze([...provider.requests]),
    });
  } finally {
    if (agent.getState() === AgentForgeState.Running) await agent.stop();
  }
}
