import type { JsonValue, ToolArguments } from "./JsonValue.js";
import type { ToolExecutionContext } from "./ToolExecutionContext.js";

export type ToolHandler = (
  argumentsValue: ToolArguments,
  context: Readonly<ToolExecutionContext>,
) => Promise<JsonValue>;

export type TypedToolHandler<
  TArguments extends ToolArguments,
  TOutput extends JsonValue,
> = (
  argumentsValue: Readonly<TArguments>,
  context: Readonly<ToolExecutionContext>,
) => Promise<TOutput>;
