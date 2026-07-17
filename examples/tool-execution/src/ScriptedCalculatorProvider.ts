import {
  LLMFinishReason,
  type LLMGenerationRequest,
  type LLMGenerationResponse,
  LLMMessageRole,
  type LLMProvider,
  type LLMProviderCapabilities,
  createLLMGenerationResponse,
  createToolCall,
  healthyProvider,
} from "@agentforge/provider-sdk";

const EXPECTED_TOOLS = ["calculator", "format_text", "lookup_inventory"];

export class ScriptedCalculatorProvider implements LLMProvider {
  readonly metadata = Object.freeze({
    name: "scripted-calculator",
    version: "1.0.0",
    description: "Deterministic provider for the tool execution example.",
  });
  readonly capabilities: Readonly<LLMProviderCapabilities> = Object.freeze({
    streaming: false,
    tools: true,
  });
  readonly requests: LLMGenerationRequest[] = [];

  async checkHealth() {
    return healthyProvider("The scripted provider is ready.");
  }

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    this.requests.push(request);
    if (this.requests.length === 1) return this.createToolCallResponse(request);
    if (this.requests.length === 2) return this.createFinalResponse(request);
    throw new Error("The scripted provider received an unexpected round.");
  }

  private createToolCallResponse(
    request: LLMGenerationRequest,
  ): Readonly<LLMGenerationResponse> {
    const names = request.tools?.map(({ name }) => name);
    if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
      throw new Error(
        "The first provider request must contain all example tools in registration order.",
      );
    }
    return createLLMGenerationResponse({
      model: request.model,
      message: {
        role: LLMMessageRole.Assistant,
        content: "",
        toolCalls: [
          createToolCall({
            id: "example-call-1",
            name: "calculator",
            arguments: { operation: "multiply", left: 7, right: 6 },
          }),
        ],
      },
      finishReason: LLMFinishReason.ToolCalls,
    });
  }

  private createFinalResponse(
    request: LLMGenerationRequest,
  ): Readonly<LLMGenerationResponse> {
    const assistantCall = request.messages.find(
      (message) =>
        message.role === LLMMessageRole.Assistant && "toolCalls" in message,
    );
    const toolResult = request.messages.find(
      (message) => message.role === LLMMessageRole.Tool,
    );
    if (
      assistantCall === undefined ||
      !("toolCalls" in assistantCall) ||
      assistantCall.toolCalls[0]?.id !== "example-call-1" ||
      toolResult?.role !== LLMMessageRole.Tool ||
      toolResult.toolCallId !== "example-call-1" ||
      toolResult.toolName !== "calculator" ||
      toolResult.result.status !== "success" ||
      !isCalculatorOutput(toolResult.result.output)
    ) {
      throw new Error(
        "The second provider request must contain the calculator call and successful result.",
      );
    }
    return createLLMGenerationResponse({
      model: request.model,
      message: {
        role: LLMMessageRole.Assistant,
        content: "7 multiplied by 6 is 42.",
      },
      finishReason: LLMFinishReason.Stop,
    });
  }
}

function isCalculatorOutput(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    value.result === 42
  );
}
