import {
  LLMMessageRole,
  isLLMStreamingProvider,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it, vi } from "vitest";

function createProvider(stream?: unknown): LLMProvider {
  return {
    metadata: { name: "example", version: "1.0.0" },
    async checkHealth() {
      return { status: "healthy" as const };
    },
    async generate(request: LLMGenerationRequest) {
      return {
        model: request.model,
        message: { role: LLMMessageRole.Assistant, content: "response" },
        finishReason: "stop" as const,
      };
    },
    ...(stream === undefined ? {} : { stream }),
  };
}

describe("isLLMStreamingProvider", () => {
  it("recognizes a provider with a callable stream method without invoking it", () => {
    const stream = vi.fn();
    const provider = createProvider(stream);

    expect(isLLMStreamingProvider(provider)).toBe(true);
    expect(stream).not.toHaveBeenCalled();
  });

  it("does not recognize an ordinary non-streaming provider", () => {
    expect(isLLMStreamingProvider(createProvider())).toBe(false);
  });

  it.each([null, 42, "stream", {}, { stream: true }])(
    "safely rejects malformed runtime value %j",
    (provider) => {
      expect(isLLMStreamingProvider(provider as unknown as LLMProvider)).toBe(
        false,
      );
    },
  );
});
