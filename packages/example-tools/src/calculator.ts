import {
  type JsonValue,
  type ToolArguments,
  type ToolExecutionContext,
  createToolDefinition,
} from "@agentforge/provider-sdk";

export type CalculatorOperation = "add" | "subtract" | "multiply" | "divide";

export interface CalculatorArguments extends ToolArguments {
  readonly operation: CalculatorOperation;
  readonly left: number;
  readonly right: number;
}

export interface CalculatorOutput extends Readonly<Record<string, JsonValue>> {
  readonly operation: CalculatorOperation;
  readonly left: number;
  readonly right: number;
  readonly result: number;
}

export const calculatorToolDefinition = createToolDefinition({
  name: "calculator",
  description: "Perform one arithmetic operation on two finite numbers.",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
      },
      left: { type: "number" },
      right: { type: "number" },
    },
    required: ["operation", "left", "right"],
    additionalProperties: false,
  },
});

export function calculatorToolHandler(
  argumentsValue: Readonly<CalculatorArguments>,
  context: Readonly<ToolExecutionContext>,
): Promise<CalculatorOutput>;
export function calculatorToolHandler(
  argumentsValue: ToolArguments,
  context: Readonly<ToolExecutionContext>,
): Promise<JsonValue>;
export async function calculatorToolHandler(
  argumentsValue: ToolArguments,
  _context: Readonly<ToolExecutionContext>,
): Promise<CalculatorOutput> {
  const operation = readOperation(argumentsValue.operation);
  const left = readFiniteNumber(argumentsValue.left);
  const right = readFiniteNumber(argumentsValue.right);
  if (operation === "divide" && right === 0) {
    throw new Error("Division by zero is not allowed.");
  }

  let result: number;
  switch (operation) {
    case "add":
      result = left + right;
      break;
    case "subtract":
      result = left - right;
      break;
    case "multiply":
      result = left * right;
      break;
    case "divide":
      result = left / right;
      break;
  }
  if (!Number.isFinite(result)) {
    throw new Error("Calculator result must be finite.");
  }
  return Object.freeze({
    operation,
    left,
    right,
    result: Object.is(result, -0) ? 0 : result,
  });
}

function readOperation(value: JsonValue | undefined): CalculatorOperation {
  if (
    value === "add" ||
    value === "subtract" ||
    value === "multiply" ||
    value === "divide"
  ) {
    return value;
  }
  throw new Error("Unsupported calculator operation.");
}

function readFiniteNumber(value: JsonValue | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Calculator arguments must contain finite numbers.");
}
