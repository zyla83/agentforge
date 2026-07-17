import type { RegisteredTool, ToolDefinition } from "@agentforge/provider-sdk";
import {
  calculatorToolDefinition,
  calculatorToolHandler,
} from "./calculator.js";
import {
  formatTextToolDefinition,
  formatTextToolHandler,
} from "./formatText.js";
import {
  lookupInventoryToolDefinition,
  lookupInventoryToolHandler,
} from "./lookupInventory.js";

export type ExampleTool = RegisteredTool;

export const exampleTools: readonly Readonly<ExampleTool>[] = Object.freeze([
  Object.freeze({
    definition: calculatorToolDefinition,
    handler: calculatorToolHandler,
  }),
  Object.freeze({
    definition: formatTextToolDefinition,
    handler: formatTextToolHandler,
  }),
  Object.freeze({
    definition: lookupInventoryToolDefinition,
    handler: lookupInventoryToolHandler,
  }),
]);

export const exampleToolDefinitions: readonly Readonly<ToolDefinition>[] =
  Object.freeze(exampleTools.map(({ definition }) => definition));
