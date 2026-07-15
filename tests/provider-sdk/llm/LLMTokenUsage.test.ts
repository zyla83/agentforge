import {
  InvalidLLMRequestError,
  createLLMTokenUsage,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe("createLLMTokenUsage", () => {
  it("creates frozen zero token usage", () => {
    const usage = createLLMTokenUsage(0, 0);

    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(Object.isFrozen(usage)).toBe(true);
  });

  it("calculates total tokens", () => {
    expect(createLLMTokenUsage(12, 8)).toEqual({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1"])(
    "rejects invalid input token value %s",
    (inputTokens) => {
      expect(() => createLLMTokenUsage(inputTokens as number, 1)).toThrow(
        InvalidLLMRequestError,
      );
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1"])(
    "rejects invalid output token value %s",
    (outputTokens) => {
      expect(() => createLLMTokenUsage(1, outputTokens as number)).toThrow(
        InvalidLLMRequestError,
      );
    },
  );

  it("reports both invalid token values deterministically", () => {
    const error = (() => {
      try {
        createLLMTokenUsage(-1, 1.5);
      } catch (caughtError) {
        return caughtError;
      }

      throw new Error("Expected token usage validation to throw.");
    })();

    expect(error).toMatchObject({
      providerName: "<unknown>",
      details: [
        "inputTokens: must be a non-negative finite integer",
        "outputTokens: must be a non-negative finite integer",
      ],
    });
  });
});
