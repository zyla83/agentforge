import { PassThrough } from "node:stream";
import {
  AgentForge,
  AgentForgeState,
  createAgentProfile,
  createConversation,
  createInMemoryConversationStore,
} from "@agentforge/core";
import {
  LLMFinishReason,
  LLMMessageRole,
  createLLMGenerationResponse,
  createToolCall,
  healthyProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProviderCapabilities,
  LLMStreamingProvider,
  ToolArguments,
} from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";
import { ChatApplication } from "../../../examples/chat-cli/src/ChatApplication.js";
import {
  createChatConversationEngine,
  createChatToolOptions,
  registerConfiguredChatTools,
} from "../../../examples/chat-cli/src/chatTools.js";
import type { ChatSpeechOutput } from "../../../examples/chat-cli/src/tts/ChatSpeechOutput.js";
import { captureStream } from "./chatTestUtils.js";

describe("chat CLI example tools integration", () => {
  it("keeps provider requests text-only in the default off mode", async () => {
    const provider = new ScriptedStreamingProvider({}, "Plain response.", true);
    const agent = new AgentForge();
    agent.registerLLMProvider(provider, { default: true });
    const tools = createChatToolOptions("off");
    registerConfiguredChatTools(agent, tools);
    await agent.start();
    try {
      const profile = createAgentProfile({
        id: "text-chat",
        systemPrompt: "Assist.",
        model: "scripted-model",
      });
      const engine = createChatConversationEngine(agent, profile, tools);
      for await (const _event of engine.streamTurn({
        conversation: createConversation(),
        content: "Hello",
      })) {
        // Consume the complete turn to inspect the provider request.
      }
      expect(agent.getRegisteredTools()).toEqual([]);
      expect(provider.requests).toHaveLength(1);
      expect(provider.requests[0]).not.toHaveProperty("tools");
    } finally {
      if (agent.getState() === AgentForgeState.Running) await agent.stop();
    }
  });

  it("executes and persists a successful calculator round", async () => {
    const result = await runToolScenario(
      { operation: "multiply", left: 7, right: 6 },
      "7 multiplied by 6 is 42.",
    );

    expect(result.output).toContain("Tool: calculator");
    expect(result.output).toContain("Tool result: calculator succeeded");
    expect(result.output).toContain("Assistant: 7 multiplied by 6 is 42.");
    expect(result.output).toContain(
      "Tools: example (calculator, format_text, lookup_inventory)",
    );
    expect(result.output).toContain("Tools mode: example");
    expect(result.output).toContain(
      "Registered tools: calculator, format_text, lookup_inventory",
    );
    expect(result.output).toContain("Tool execution: enabled");
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]?.tools?.map(({ name }) => name)).toEqual([
      "calculator",
      "format_text",
      "lookup_inventory",
    ]);
    expect(result.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(result.messages[2]).toMatchObject({
      role: "tool",
      result: { status: "success", output: { result: 42 } },
    });
  });

  it("renders a normal tool failure and persists the final conversation", async () => {
    const result = await runToolScenario(
      { operation: "divide", left: 7, right: 0 },
      "I could not divide by zero.",
    );

    expect(result.output).toContain(
      'Tool result: calculator failed (tool_execution_failed): Tool "calculator" failed.',
    );
    expect(result.output).toContain("Assistant: I could not divide by zero.");
    expect(result.errors).toBe("");
    expect(result.messages[2]).toMatchObject({
      role: "tool",
      result: { status: "error", error: { code: "tool_execution_failed" } },
    });
  });

  it("speaks only the final answer after a tool round", async () => {
    const speak = vi.fn<ChatSpeechOutput["speak"]>().mockResolvedValue();
    const result = await runToolScenario(
      { operation: "multiply", left: 7, right: 6 },
      "The final answer is 42.",
      { speak },
    );

    expect(result.output).toContain("Tool: calculator");
    expect(result.output).toContain("Tool result: calculator succeeded");
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0]).toBe("The final answer is 42.");
    expect(speak.mock.calls[0]?.[0]).not.toContain("calculator");
  });
});

async function runToolScenario(
  argumentsValue: ToolArguments,
  finalContent: string,
  speech?: ChatSpeechOutput,
) {
  const provider = new ScriptedStreamingProvider(argumentsValue, finalContent);
  const agent = new AgentForge();
  agent.registerLLMProvider(provider, { default: true });
  const tools = createChatToolOptions("example");
  registerConfiguredChatTools(agent, tools);
  await agent.start();

  try {
    const profile = createAgentProfile({
      id: "interactive-chat",
      systemPrompt: "Use tools when useful.",
      provider: provider.metadata.name,
      model: "scripted-model",
    });
    const engine = createChatConversationEngine(agent, profile, tools);
    const store = createInMemoryConversationStore();
    const initialEntry = await store.save(createConversation({ id: "active" }));
    const input = new PassThrough();
    const output = captureStream();
    const errors = captureStream();
    const application = new ChatApplication({
      agent,
      engine,
      profile,
      store,
      initialEntry,
      dataDirectory: "C:\\chat-data",
      timeoutMs: 1_000,
      input,
      output: output.stream,
      errorOutput: errors.stream,
      tools,
      tts: speech === undefined ? { mode: "off" } : { mode: "piper", speech },
    });

    const running = application.run();
    await output.waitFor("You: ");
    input.write("Use the calculator\n");
    await output.waitFor(`Assistant: ${finalContent}\nYou: `);
    input.write("/info\n");
    await output.waitFor("Data directory: C:\\chat-data\nYou: ");
    input.write("/exit\n");
    await running;
    const persisted = await store.require("active");
    return {
      output: output.read(),
      errors: errors.read(),
      requests: provider.requests,
      messages: persisted.conversation.messages,
    };
  } finally {
    if (agent.getState() === AgentForgeState.Running) await agent.stop();
  }
}

class ScriptedStreamingProvider implements LLMStreamingProvider {
  readonly metadata = Object.freeze({
    name: "scripted-chat",
    version: "1.0.0",
  });
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: true,
    tools: true,
  });
  readonly requests: LLMGenerationRequest[] = [];

  constructor(
    private readonly argumentsValue: ToolArguments,
    private readonly finalContent: string,
    private readonly textOnly = false,
  ) {}

  async checkHealth() {
    return healthyProvider();
  }

  async generate(): Promise<LLMGenerationResponse> {
    throw new Error("The CLI integration must use streaming.");
  }

  async *stream(request: LLMGenerationRequest) {
    this.requests.push(request);
    if (this.textOnly) {
      yield {
        type: "delta",
        model: request.model,
        delta: this.finalContent,
      } as const;
      yield {
        type: "completed",
        response: createLLMGenerationResponse({
          model: request.model,
          message: {
            role: LLMMessageRole.Assistant,
            content: this.finalContent,
          },
          finishReason: LLMFinishReason.Stop,
        }),
      } as const;
      return;
    }
    if (this.requests.length === 1) {
      yield {
        type: "completed",
        response: createLLMGenerationResponse({
          model: request.model,
          message: {
            role: LLMMessageRole.Assistant,
            content: "",
            toolCalls: [
              createToolCall({
                id: "calculator-call",
                name: "calculator",
                arguments: this.argumentsValue,
              }),
            ],
          },
          finishReason: LLMFinishReason.ToolCalls,
        }),
      } as const;
      return;
    }
    yield {
      type: "delta",
      model: request.model,
      delta: this.finalContent,
    } as const;
    yield {
      type: "completed",
      response: createLLMGenerationResponse({
        model: request.model,
        message: { role: LLMMessageRole.Assistant, content: this.finalContent },
        finishReason: LLMFinishReason.Stop,
      }),
    } as const;
  }
}
