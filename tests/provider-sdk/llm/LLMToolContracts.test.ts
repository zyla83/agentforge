import {
  InvalidLLMRequestError,
  InvalidLLMResponseError,
  LLMFinishReason,
  LLMMessageRole,
  createLLMGenerationResponse,
  getLLMProviderCapabilities,
  validateLLMGenerationRequest,
} from "@agentforge/provider-sdk";
import type { LLMProvider } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const definition = {
  name: "weather",
  description: "Read weather.",
  inputSchema: { type: "object" as const, properties: {} },
};
const call = { id: "call-1", name: "weather", arguments: { city: "Łódź" } };

describe("provider-neutral LLM tool contracts", () => {
  it("accepts tool definitions and structured tool history", () => {
    const result = {
      toolCallId: call.id,
      toolName: call.name,
      status: "success" as const,
      output: { temperature: 20 },
    };
    expect(() =>
      validateLLMGenerationRequest({
        model: "model",
        tools: [definition],
        messages: [
          { role: LLMMessageRole.User, content: "Weather?" },
          { role: LLMMessageRole.Assistant, content: "", toolCalls: [call] },
          {
            role: LLMMessageRole.Tool,
            content: '{"output":{"temperature":20},"status":"success"}',
            toolCallId: call.id,
            toolName: call.name,
            result,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects empty and invalid tool definition collections", () => {
    expect(() =>
      validateLLMGenerationRequest({
        model: "model",
        messages: [{ role: LLMMessageRole.User, content: "Hello" }],
        tools: [],
      }),
    ).toThrow(InvalidLLMRequestError);
  });

  it("snapshots a valid immutable tool-call response", () => {
    const response = createLLMGenerationResponse({
      model: "model",
      finishReason: LLMFinishReason.ToolCalls,
      message: {
        role: LLMMessageRole.Assistant,
        content: "",
        toolCalls: [call],
      },
    });
    expect(response.message).toMatchObject({ toolCalls: [call] });
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.message)).toBe(true);
    expect(
      Object.isFrozen((response.message as { toolCalls: unknown }).toolCalls),
    ).toBe(true);
  });

  it.each([
    {
      finishReason: LLMFinishReason.Stop,
      message: {
        role: LLMMessageRole.Assistant,
        content: "",
        toolCalls: [call],
      },
    },
    {
      finishReason: LLMFinishReason.ToolCalls,
      message: { role: LLMMessageRole.Assistant, content: "final" },
    },
    {
      finishReason: LLMFinishReason.ToolCalls,
      message: {
        role: LLMMessageRole.Assistant,
        content: "text",
        toolCalls: [call],
      },
    },
    {
      finishReason: LLMFinishReason.ToolCalls,
      message: {
        role: LLMMessageRole.Assistant,
        content: "",
        toolCalls: [call, call],
      },
    },
  ])("rejects inconsistent tool response %#", (partial) => {
    expect(() =>
      createLLMGenerationResponse({ model: "model", ...partial } as never),
    ).toThrow(InvalidLLMResponseError);
  });

  it("defaults undeclared tools capability to false", () => {
    const provider = {
      generate: async () => undefined,
    } as unknown as LLMProvider;
    expect(getLLMProviderCapabilities(provider)).toEqual({
      streaming: false,
      tools: false,
    });
  });
});
