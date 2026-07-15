import {
  LLMFinishReason,
  LLMMessageRole,
  ProviderHealthStatus,
  healthyProvider,
  validateLLMGenerationRequest,
} from "@agentforge/provider-sdk";
import type {
  LLMGenerationRequest,
  LLMGenerationResponse,
  LLMProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

class ExampleLLMProvider implements LLMProvider {
  readonly metadata = {
    name: "example-llm",
    version: "1.0.0",
  };

  async checkHealth(
    _options?: ProviderRequestOptions,
  ): Promise<ProviderHealth> {
    return healthyProvider("Example LLM provider is ready.");
  }

  async generate(
    request: LLMGenerationRequest,
  ): Promise<LLMGenerationResponse> {
    validateLLMGenerationRequest(request);

    return {
      model: request.model,
      message: {
        role: LLMMessageRole.Assistant,
        content: "Example response",
      },
      finishReason: LLMFinishReason.Stop,
    };
  }
}

describe("LLMProvider contract", () => {
  it("supports health checks through the base provider contract", async () => {
    const provider: LLMProvider = new ExampleLLMProvider();

    await expect(provider.checkHealth()).resolves.toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Example LLM provider is ready.",
    });
  });

  it("generates one complete assistant response", async () => {
    const provider: LLMProvider = new ExampleLLMProvider();
    const request: LLMGenerationRequest = {
      model: "example-model",
      messages: [{ role: LLMMessageRole.User, content: "Hello" }],
    };

    await expect(provider.generate(request)).resolves.toEqual({
      model: "example-model",
      message: {
        role: LLMMessageRole.Assistant,
        content: "Example response",
      },
      finishReason: LLMFinishReason.Stop,
    });
  });
});
