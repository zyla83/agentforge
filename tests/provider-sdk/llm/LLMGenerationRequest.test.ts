import {
  InvalidLLMRequestError,
  LLMMessageRole,
  ProviderError,
  ProviderRequestError,
  validateLLMGenerationRequest,
} from "@agentforge/provider-sdk";
import type { LLMGenerationRequest } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

function createRequest(
  overrides: Partial<LLMGenerationRequest> = {},
): LLMGenerationRequest {
  return {
    model: "example-model",
    messages: [{ role: LLMMessageRole.User, content: "Hello" }],
    ...overrides,
  };
}

function asRequest(value: unknown): LLMGenerationRequest {
  return value as LLMGenerationRequest;
}

function captureInvalidRequest(value: unknown): InvalidLLMRequestError {
  try {
    validateLLMGenerationRequest(asRequest(value));
  } catch (error) {
    if (error instanceof InvalidLLMRequestError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected LLM request validation to throw.");
}

describe("validateLLMGenerationRequest valid requests", () => {
  it("accepts one user message", () => {
    expect(() => validateLLMGenerationRequest(createRequest())).not.toThrow();
  });

  it("accepts all supported message roles", () => {
    const result = {
      toolCallId: "call-1",
      toolName: "example",
      status: "success" as const,
      output: { value: "done" },
    };
    const request = createRequest({
      messages: [
        { role: LLMMessageRole.System, content: "Follow instructions." },
        { role: LLMMessageRole.User, content: "Hello" },
        { role: LLMMessageRole.Assistant, content: "Hi" },
        {
          role: LLMMessageRole.Assistant,
          content: "",
          toolCalls: [{ id: "call-1", name: "example", arguments: {} }],
        },
        {
          role: LLMMessageRole.Tool,
          content: '{"status":"success","output":{"value":"done"}}',
          toolCallId: "call-1",
          toolName: "example",
          result,
        },
      ],
    });

    expect(() => validateLLMGenerationRequest(request)).not.toThrow();
  });

  it("preserves model names and message content", () => {
    const request = createRequest({
      model: "  custom/model:latest  ",
      messages: [{ role: LLMMessageRole.User, content: "  Keep spacing  " }],
    });

    validateLLMGenerationRequest(request);

    expect(request.model).toBe("  custom/model:latest  ");
    expect(request.messages[0]?.content).toBe("  Keep spacing  ");
  });

  it("accepts empty and fully populated generation options", () => {
    expect(() =>
      validateLLMGenerationRequest(createRequest({ generation: {} })),
    ).not.toThrow();
    expect(() =>
      validateLLMGenerationRequest(
        createRequest({
          generation: {
            temperature: 1,
            topP: 0.9,
            maxTokens: 512,
            stop: ["END", "STOP"],
          },
        }),
      ),
    ).not.toThrow();
  });

  it("accepts provider timeout and abort signal options", () => {
    const controller = new AbortController();
    const request = createRequest({
      request: { timeoutMs: 5000, signal: controller.signal },
    });

    expect(() => validateLLMGenerationRequest(request)).not.toThrow();
  });

  it("does not mutate the request", () => {
    const message = { role: LLMMessageRole.User, content: "  Hello  " };
    const generation = { temperature: 0.5, stop: [" END "] };
    const request = createRequest({
      model: " model ",
      messages: [message],
      generation,
      request: { timeoutMs: 1000 },
    });
    const snapshot = JSON.parse(JSON.stringify(request));

    validateLLMGenerationRequest(request);

    expect(request).toEqual(snapshot);
    expect(request.messages[0]).toBe(message);
    expect(request.generation).toBe(generation);
  });
});

describe("validateLLMGenerationRequest malformed requests", () => {
  it.each([undefined, null, [], "request", 42])(
    "rejects malformed request value %j",
    (request) => {
      expect(captureInvalidRequest(request).details).toEqual([
        "request: must be an object",
      ]);
    },
  );

  it.each([
    [
      { messages: createRequest().messages },
      "model: must be a non-empty string",
    ],
    [
      { model: 42, messages: createRequest().messages },
      "model: must be a non-empty string",
    ],
    [
      createRequest({ model: "" }),
      "model: must contain at least one non-whitespace character",
    ],
    [
      createRequest({ model: "  \t" }),
      "model: must contain at least one non-whitespace character",
    ],
  ])("rejects an invalid model", (request, detail) => {
    expect(captureInvalidRequest(request).details).toContain(detail);
  });

  it.each([
    [{ model: "example" }, "messages: must be an array"],
    [{ model: "example", messages: "hello" }, "messages: must be an array"],
    [
      createRequest({ messages: [] }),
      "messages: must contain at least one message",
    ],
    [
      createRequest({ messages: [null] as never }),
      "messages[0]: must be an object",
    ],
    [
      createRequest({ messages: [42] as never }),
      "messages[0]: must be an object",
    ],
  ])("rejects an invalid messages collection", (request, detail) => {
    expect(captureInvalidRequest(request).details).toContain(detail);
  });

  it("rejects unsupported roles", () => {
    const request = createRequest({
      messages: [{ role: "developer", content: "Result" }] as never,
    });

    expect(captureInvalidRequest(request).details).toEqual([
      "messages[0].role: unsupported role",
    ]);
  });

  it.each([undefined, 42, "", "  \t"])(
    "rejects invalid message content %j",
    (content) => {
      const request = createRequest({
        messages: [{ role: LLMMessageRole.User, content }] as never,
      });

      expect(captureInvalidRequest(request).details).toEqual([
        "messages[0].content: must be a non-empty string",
      ]);
    },
  );
});

describe("validateLLMGenerationRequest generation options", () => {
  it.each([0, 2])("accepts temperature boundary %s", (temperature) => {
    expect(() =>
      validateLLMGenerationRequest(
        createRequest({ generation: { temperature } }),
      ),
    ).not.toThrow();
  });

  it.each([-0.1, 2.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid temperature %s",
    (temperature) => {
      expect(
        captureInvalidRequest(createRequest({ generation: { temperature } }))
          .details,
      ).toContain("generation.temperature: must be between 0 and 2");
    },
  );

  it.each([Number.MIN_VALUE, 1])("accepts topP boundary %s", (topP) => {
    expect(() =>
      validateLLMGenerationRequest(createRequest({ generation: { topP } })),
    ).not.toThrow();
  });

  it.each([0, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid topP %s",
    (topP) => {
      expect(
        captureInvalidRequest(createRequest({ generation: { topP } })).details,
      ).toContain("generation.topP: must be greater than 0 and at most 1");
    },
  );

  it("accepts a positive integer maxTokens", () => {
    expect(() =>
      validateLLMGenerationRequest(
        createRequest({ generation: { maxTokens: 1 } }),
      ),
    ).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid maxTokens %s",
    (maxTokens) => {
      expect(
        captureInvalidRequest(createRequest({ generation: { maxTokens } }))
          .details,
      ).toContain("generation.maxTokens: must be a positive finite integer");
    },
  );

  it("accepts stop sequences without modifying them", () => {
    const stop = [" END ", "STOP"];
    const request = createRequest({ generation: { stop } });

    validateLLMGenerationRequest(request);

    expect(request.generation?.stop).toEqual([" END ", "STOP"]);
  });

  it.each([
    [[], "generation.stop: must contain at least one stop sequence"],
    [
      Array.from({ length: 17 }, (_, index) => `stop-${index}`),
      "generation.stop: must contain at most 16 stop sequences",
    ],
    [[""], "generation.stop[0]: must be a non-empty string"],
    [["  "], "generation.stop[0]: must be a non-empty string"],
    [[42], "generation.stop[0]: must be a non-empty string"],
    ["END", "generation.stop: must be an array"],
    [null, "generation.stop: must be an array"],
  ])("rejects invalid stop sequences", (stop, detail) => {
    const request = createRequest({ generation: { stop } as never });

    expect(captureInvalidRequest(request).details).toContain(detail);
  });

  it.each([null, [], "options"])(
    "rejects malformed generation options %j",
    (generation) => {
      expect(
        captureInvalidRequest(
          createRequest({ generation: generation as never }),
        ).details,
      ).toEqual(["generation: must be an object"]);
    },
  );
});

describe("validateLLMGenerationRequest provider request options", () => {
  it("translates invalid timeout validation and preserves its cause", () => {
    const error = captureInvalidRequest(
      createRequest({ request: { timeoutMs: 0 } }),
    );

    expect(error.details).toContain(
      "request.timeoutMs: must be a positive finite integer",
    );
    expect(error.cause).toBeInstanceOf(ProviderRequestError);
  });

  it.each([null, [], "options"])(
    "rejects malformed provider request options %j",
    (requestOptions) => {
      expect(
        captureInvalidRequest(
          createRequest({ request: requestOptions as never }),
        ).details,
      ).toEqual(["request: must be an object"]);
    },
  );
});

describe("InvalidLLMRequestError aggregation", () => {
  it("collects details in deterministic order", () => {
    const error = captureInvalidRequest({
      model: " ",
      messages: [{ role: "developer", content: "" }, null],
      generation: {
        temperature: 3,
        topP: 0,
        maxTokens: -1,
        stop: ["", "valid"],
      },
      request: { timeoutMs: 0 },
    });

    expect(error.details).toEqual([
      "model: must contain at least one non-whitespace character",
      "messages[0].role: unsupported role",
      "messages[0].content: must be a non-empty string",
      "messages[1]: must be an object",
      "generation.temperature: must be between 0 and 2",
      "generation.topP: must be greater than 0 and at most 1",
      "generation.maxTokens: must be a positive finite integer",
      "generation.stop[0]: must be a non-empty string",
      "request.timeoutMs: must be a positive finite integer",
    ]);
    expect(error.message).toBe(
      `The LLM generation request is invalid: ${error.details.join("; ")}.`,
    );
  });

  it("copies and freezes details and exposes the provider error hierarchy", () => {
    const details = ["model: must be a non-empty string"];
    const cause = new Error("validation cause");
    const error = new InvalidLLMRequestError(details, { cause });
    details.push("mutated");

    expect(error.details).toEqual(["model: must be a non-empty string"]);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toBeInstanceOf(Error);
    expect(error.providerName).toBe("<unknown>");
    expect(error.cause).toBe(cause);
  });
});
