import type { ToolDefinition } from "./ToolDefinition.js";
import { InvalidToolDefinitionError } from "./errors/index.js";
import { snapshotToolInputSchema } from "./internal/validateJsonSchema.js";
import {
  inspectPlainObject,
  rejectUnknownKeys,
  validatePreservedString,
  validateToolName,
} from "./internal/validation.js";

const DEFINITION_KEYS = new Set(["name", "description", "inputSchema"]);

export function validateToolDefinition(definition: ToolDefinition): void {
  snapshotToolDefinition(definition);
}

export function snapshotToolDefinition(
  definition: unknown,
): Readonly<ToolDefinition> {
  const details: string[] = [];
  const inspected = inspectPlainObject(definition, "definition", details);
  if (inspected === undefined) throw new InvalidToolDefinitionError(details);
  rejectUnknownKeys(inspected, DEFINITION_KEYS, "definition", details);

  const nameValid = validateToolName(inspected.values.name, "name", details);
  const descriptionValid = validatePreservedString(
    inspected.values.description,
    "description",
    2_000,
    details,
  );
  const inputSchema = snapshotToolInputSchema(
    inspected.values.inputSchema,
    "inputSchema",
    details,
  );

  if (
    details.length > 0 ||
    !nameValid ||
    !descriptionValid ||
    inputSchema === undefined
  ) {
    throw new InvalidToolDefinitionError(details);
  }
  return Object.freeze({
    name: inspected.values.name as string,
    description: inspected.values.description as string,
    inputSchema,
  });
}
