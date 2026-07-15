import { InvalidLLMRequestError } from "./errors/index.js";

export interface LLMTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export function createLLMTokenUsage(
  inputTokens: number,
  outputTokens: number,
): Readonly<LLMTokenUsage> {
  const details: string[] = [];

  if (!isNonNegativeFiniteInteger(inputTokens)) {
    details.push("inputTokens: must be a non-negative finite integer");
  }

  if (!isNonNegativeFiniteInteger(outputTokens)) {
    details.push("outputTokens: must be a non-negative finite integer");
  }

  if (details.length > 0) {
    throw new InvalidLLMRequestError(details);
  }

  return Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  });
}

function isNonNegativeFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}
