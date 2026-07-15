import { MockLLMProvider } from "@agentforge/provider-mock";
import type { MockLLMProviderOptions } from "@agentforge/provider-mock";
import {
  InvalidLLMRequestError,
  LLMFinishReason,
  LLMMessageRole,
  ProviderAbortError,
  ProviderHealthStatus,
  ProviderRequestError,
} from "@agentforge/provider-sdk";
import type { LLMGenerationRequest } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function createRequest(
  model = "test-model",
  content = "Hello",
): LLMGenerationRequest {
  return {
    model,
    messages: [{ role: LLMMessageRole.User, content }],
  };
}

describe("MockLLMProvider defaults", () => {
  it("uses frozen deterministic metadata", () => {
    const provider = new MockLLMProvider();

    expect(provider.metadata).toEqual({
      name: "mock-llm",
      version: "1.0.0",
      description: "Deterministic mock LLM provider.",
    });
    expect(Object.isFrozen(provider.metadata)).toBe(true);
  });

  it("uses a healthy default health result", async () => {
    const health = await new MockLLMProvider().checkHealth();

    expect(health).toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Mock provider is ready.",
    });
    expect(Object.isFrozen(health)).toBe(true);
  });

  it("uses deterministic response defaults", async () => {
    const response = await new MockLLMProvider().generate(createRequest());

    expect(response.message.content).toBe("Mock response");
    expect(response.finishReason).toBe(LLMFinishReason.Stop);
  });
});

describe("MockLLMProvider custom options", () => {
  it("supports custom metadata, response, finish reason, and health", async () => {
    const health = {
      status: ProviderHealthStatus.Degraded,
      message: "Mock provider is degraded.",
      details: { reason: "maintenance" },
    };
    const provider = new MockLLMProvider({
      name: "custom-mock",
      version: "2.0.0",
      description: "Custom mock provider.",
      responseContent: "  Deterministic custom response  ",
      finishReason: LLMFinishReason.Length,
      health,
    });

    expect(provider.metadata).toEqual({
      name: "custom-mock",
      version: "2.0.0",
      description: "Custom mock provider.",
    });
    await expect(provider.checkHealth()).resolves.toEqual(health);
    await expect(provider.generate(createRequest())).resolves.toMatchObject({
      message: { content: "  Deterministic custom response  " },
      finishReason: LLMFinishReason.Length,
    });
  });

  it("does not mutate caller options", () => {
    const options = {
      name: "custom",
      version: "1.2.3",
      description: "Custom provider.",
      responseContent: "Custom response",
      finishReason: LLMFinishReason.Unknown,
      health: {
        status: ProviderHealthStatus.Unavailable,
        message: "Offline",
        details: { retryable: false },
      },
    };
    const expected = {
      ...options,
      health: {
        ...options.health,
        details: { ...options.health.details },
      },
    };

    new MockLLMProvider(options);

    expect(options).toEqual(expected);
  });

  it("snapshots configured health and its details", async () => {
    const details = { endpoint: "primary" };
    const health = {
      status: ProviderHealthStatus.Healthy,
      message: "Ready",
      details,
    };
    const provider = new MockLLMProvider({ health });

    details.endpoint = "mutated";
    health.message = "Mutated";
    const result = await provider.checkHealth();

    expect(result).toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Ready",
      details: { endpoint: "primary" },
    });
    expect(result).not.toBe(health);
    expect(result.details).not.toBe(details);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.details)).toBe(true);
  });

  it("allows malformed metadata values for registration-time validation", () => {
    const provider = new MockLLMProvider({
      name: 42 as unknown as string,
      version: null as unknown as string,
      description: [] as unknown as string,
    });

    expect(provider.metadata).toEqual({
      name: 42,
      version: null,
      description: [],
    });
  });
});

describe("MockLLMProvider generation", () => {
  it("returns a frozen assistant response for the requested model", async () => {
    const provider = new MockLLMProvider({
      responseContent: "Deterministic response",
      finishReason: LLMFinishReason.Length,
    });
    const response = await provider.generate(createRequest("custom-model"));

    expect(response).toEqual({
      model: "custom-model",
      message: {
        role: LLMMessageRole.Assistant,
        content: "Deterministic response",
      },
      finishReason: LLMFinishReason.Length,
    });
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.message)).toBe(true);
    expect(response).not.toHaveProperty("usage");
  });

  it("returns equivalent deterministic responses for repeated requests", async () => {
    const provider = new MockLLMProvider();
    const request = createRequest();

    const first = await provider.generate(request);
    const second = await provider.generate(request);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

describe("MockLLMProvider validation", () => {
  it("rejects invalid requests without recording them", async () => {
    const provider = new MockLLMProvider();
    const request = {
      model: "",
      messages: [],
    } as LLMGenerationRequest;

    await expect(provider.generate(request)).rejects.toBeInstanceOf(
      InvalidLLMRequestError,
    );
    expect(provider.getRequests()).toEqual([]);
  });

  it.each(["", "  ", 42, null])(
    "rejects malformed response content %j",
    (responseContent) => {
      expect(
        () =>
          new MockLLMProvider({
            responseContent: responseContent as string,
          }),
      ).toThrow(InvalidLLMRequestError);
    },
  );

  it("rejects an unsupported finish reason", () => {
    expect(
      () =>
        new MockLLMProvider({
          finishReason: "tool_calls" as LLMFinishReason,
        }),
    ).toThrow(InvalidLLMRequestError);
  });

  it.each([null, [], "options", 42])(
    "rejects malformed runtime options %j",
    (options) => {
      expect(
        () => new MockLLMProvider(options as MockLLMProviderOptions),
      ).toThrow(InvalidLLMRequestError);
    },
  );

  it.each([
    null,
    { status: "broken" },
    { status: ProviderHealthStatus.Healthy, message: 42 },
    { status: ProviderHealthStatus.Healthy, details: [] },
  ])("rejects malformed health option %j", (health) => {
    expect(
      () =>
        new MockLLMProvider({
          health: health as MockLLMProviderOptions["health"],
        }),
    ).toThrow(InvalidLLMRequestError);
  });
});

describe("MockLLMProvider cancellation", () => {
  it("generates normally with an active signal", async () => {
    const provider = new MockLLMProvider();
    const controller = new AbortController();
    const request = {
      ...createRequest(),
      request: { signal: controller.signal },
    };

    await expect(provider.generate(request)).resolves.toBeDefined();
    expect(provider.getRequests()).toHaveLength(1);
  });

  it("rejects aborted generation without recording and preserves the reason", async () => {
    const provider = new MockLLMProvider();
    const controller = new AbortController();
    const reason = new Error("cancelled by caller");
    controller.abort(reason);
    const request = {
      ...createRequest(),
      request: { signal: controller.signal },
    };

    const error = await provider
      .generate(request)
      .catch((caughtError) => Promise.resolve(caughtError));

    expect(error).toBeInstanceOf(ProviderAbortError);
    expect(error).toMatchObject({ cause: reason, providerName: "mock-llm" });
    expect(provider.getRequests()).toEqual([]);
  });

  it("validates before checking cancellation", async () => {
    const provider = new MockLLMProvider();
    const controller = new AbortController();
    controller.abort();
    const request = {
      model: "",
      messages: [],
      request: { signal: controller.signal },
    } as LLMGenerationRequest;

    await expect(provider.generate(request)).rejects.toBeInstanceOf(
      InvalidLLMRequestError,
    );
    expect(provider.getRequests()).toEqual([]);
  });

  it("rejects an aborted health check", async () => {
    const provider = new MockLLMProvider();
    const controller = new AbortController();
    const reason = new Error("health check cancelled");
    controller.abort(reason);

    await expect(
      provider.checkHealth({ signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "ProviderAbortError",
      cause: reason,
    });
  });
});

describe("MockLLMProvider request history", () => {
  it("starts with a new frozen empty history on every read", () => {
    const provider = new MockLLMProvider();
    const first = provider.getRequests();
    const second = provider.getRequests();

    expect(first).toEqual([]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("records frozen request snapshots in call order", async () => {
    const provider = new MockLLMProvider();

    await provider.generate(createRequest("first-model", "First"));
    await provider.generate(createRequest("second-model", "Second"));
    const requests = provider.getRequests();

    expect(requests.map(({ model }) => model)).toEqual([
      "first-model",
      "second-model",
    ]);
    expect(requests.every(Object.isFrozen)).toBe(true);
  });

  it("snapshots and freezes every request component", async () => {
    const provider = new MockLLMProvider();
    const controller = new AbortController();
    const messages = [
      { role: LLMMessageRole.User, content: "Original message" },
    ];
    const stop = ["END"];
    const generation = {
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 100,
      stop,
    };
    const requestOptions = { signal: controller.signal, timeoutMs: 5000 };
    const request = {
      model: "original-model",
      messages,
      generation,
      request: requestOptions,
    };

    await provider.generate(request);
    request.model = "mutated-model";
    messages[0].content = "Mutated message";
    messages.push({ role: LLMMessageRole.Assistant, content: "Injected" });
    generation.temperature = 2;
    stop[0] = "MUTATED";
    requestOptions.timeoutMs = 1;

    const snapshot = provider.getRequests()[0];
    expect(snapshot).toEqual({
      model: "original-model",
      messages: [{ role: LLMMessageRole.User, content: "Original message" }],
      generation: {
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 100,
        stop: ["END"],
      },
      request: { signal: controller.signal, timeoutMs: 5000 },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.messages)).toBe(true);
    expect(Object.isFrozen(snapshot?.messages[0])).toBe(true);
    expect(Object.isFrozen(snapshot?.generation)).toBe(true);
    expect(Object.isFrozen(snapshot?.generation?.stop)).toBe(true);
    expect(Object.isFrozen(snapshot?.request)).toBe(true);
    expect(snapshot?.request?.signal).toBe(controller.signal);
  });

  it("prevents returned history mutation from affecting internal history", async () => {
    const provider = new MockLLMProvider();
    await provider.generate(createRequest());
    const history = provider.getRequests();

    expect(() =>
      (history as LLMGenerationRequest[]).push(createRequest("injected")),
    ).toThrow(TypeError);
    expect(provider.getRequests()).toHaveLength(1);
    expect(provider.getRequests()[0]?.model).toBe("test-model");
  });

  it("clears history and safely clears an empty history", async () => {
    const provider = new MockLLMProvider();
    await provider.generate(createRequest());

    provider.clearRequests();
    provider.clearRequests();

    expect(provider.getRequests()).toEqual([]);
    await expect(provider.checkHealth()).resolves.toBeDefined();
    expect(provider.metadata.name).toBe("mock-llm");
  });
});

describe("MockLLMProvider health checks", () => {
  it("returns unavailable health as a normal frozen result", async () => {
    const provider = new MockLLMProvider({
      health: {
        status: ProviderHealthStatus.Unavailable,
        message: "Provider is offline.",
      },
    });

    const health = await provider.checkHealth();

    expect(health).toEqual({
      status: ProviderHealthStatus.Unavailable,
      message: "Provider is offline.",
    });
    expect(Object.isFrozen(health)).toBe(true);
  });

  it("validates timeout options", async () => {
    await expect(
      new MockLLMProvider().checkHealth({ timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("does not record health checks", async () => {
    const provider = new MockLLMProvider();

    await provider.checkHealth();

    expect(provider.getRequests()).toEqual([]);
  });
});
