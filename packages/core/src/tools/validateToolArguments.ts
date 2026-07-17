import { createToolDefinition } from "@agentforge/provider-sdk";
import type {
  JsonPrimitive,
  JsonSchema,
  JsonValue,
  ToolArguments,
  ToolDefinition,
} from "@agentforge/provider-sdk";
import { InvalidToolArgumentsError } from "./errors/index.js";

export function validateToolArguments(
  definition: Readonly<ToolDefinition>,
  argumentsValue: ToolArguments,
): Readonly<ToolArguments> {
  const snapshotDefinition = createToolDefinition(definition);
  const details: string[] = [];
  const snapshot = snapshotJson(argumentsValue, "arguments", details);
  if (snapshot !== undefined)
    validateValue(
      snapshot,
      snapshotDefinition.inputSchema,
      "arguments",
      details,
    );
  if (details.length > 0 || !isPlainObject(snapshot)) {
    throw new InvalidToolArgumentsError(snapshotDefinition.name, details);
  }
  return snapshot;
}

function validateValue(
  value: JsonValue,
  schema: Readonly<JsonSchema>,
  path: string,
  details: string[],
): void {
  if (!matchesType(value, schema.type)) {
    details.push(`${path} must be ${article(schema.type)} ${schema.type}`);
    return;
  }
  validateEnumAndConst(value, schema, path, details);
  if (schema.type === "object" && isPlainObject(value))
    validateObject(value, schema, path, details);
  if (schema.type === "array" && Array.isArray(value))
    validateArray(value, schema, path, details);
  if (schema.type === "string" && typeof value === "string")
    validateString(value, schema, path, details);
  if (
    (schema.type === "number" || schema.type === "integer") &&
    typeof value === "number"
  )
    validateNumber(value, schema, path, details);
}

function validateObject(
  value: Readonly<Record<string, JsonValue>>,
  schema: Readonly<JsonSchema>,
  path: string,
  details: string[],
): void {
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(value, key))
      details.push(`${propertyPath(path, key)} is required`);
  }
  for (const [key, child] of Object.entries(value)) {
    const propertySchema = schema.properties?.[key];
    if (propertySchema !== undefined) {
      validateValue(child, propertySchema, propertyPath(path, key), details);
    } else if (schema.additionalProperties === false) {
      details.push(`${propertyPath(path, key)} is not allowed`);
    } else if (typeof schema.additionalProperties === "object") {
      validateValue(
        child,
        schema.additionalProperties,
        propertyPath(path, key),
        details,
      );
    }
  }
}

function validateArray(
  value: readonly JsonValue[],
  schema: Readonly<JsonSchema>,
  path: string,
  details: string[],
): void {
  if (schema.minItems !== undefined && value.length < schema.minItems)
    details.push(`${path} must contain at least ${schema.minItems} items`);
  if (schema.maxItems !== undefined && value.length > schema.maxItems)
    details.push(`${path} must contain at most ${schema.maxItems} items`);
  if (schema.items !== undefined)
    value.forEach((item, index) =>
      validateValue(
        item,
        schema.items as JsonSchema,
        `${path}[${index}]`,
        details,
      ),
    );
}

function validateString(
  value: string,
  schema: Readonly<JsonSchema>,
  path: string,
  details: string[],
): void {
  if (schema.minLength !== undefined && value.length < schema.minLength)
    details.push(
      `${path} must contain at least ${schema.minLength} characters`,
    );
  if (schema.maxLength !== undefined && value.length > schema.maxLength)
    details.push(`${path} must contain at most ${schema.maxLength} characters`);
}

function validateNumber(
  value: number,
  schema: Readonly<JsonSchema>,
  path: string,
  details: string[],
): void {
  if (schema.minimum !== undefined && value < schema.minimum)
    details.push(`${path} must be at least ${schema.minimum}`);
  if (schema.maximum !== undefined && value > schema.maximum)
    details.push(`${path} must be at most ${schema.maximum}`);
}

function validateEnumAndConst(
  value: JsonValue,
  schema: Readonly<JsonSchema>,
  path: string,
  details: string[],
): void {
  if (
    schema.enum !== undefined &&
    !schema.enum.some((candidate) => Object.is(candidate, value))
  )
    details.push(
      `${path} must be one of ${schema.enum.map(formatPrimitive).join(", ")}`,
    );
  if (schema.const !== undefined && !Object.is(schema.const, value))
    details.push(`${path} must equal ${formatPrimitive(schema.const)}`);
}

function matchesType(value: JsonValue, type: JsonSchema["type"]): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer")
    return typeof value === "number" && Number.isInteger(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number";
  return typeof value === "boolean";
}

function snapshotJson(
  value: unknown,
  path: string,
  details: string[],
  seen = new Set<object>(),
): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    details.push(`${path} must contain only finite JSON numbers`);
    return undefined;
  }
  if (typeof value !== "object") {
    details.push(`${path} must be a JSON value`);
    return undefined;
  }
  if (seen.has(value)) {
    details.push(`${path} must not contain circular references`);
    return undefined;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    value.forEach((item, index) => {
      const child = snapshotJson(item, `${path}[${index}]`, details, seen);
      if (child !== undefined) result.push(child);
    });
    seen.delete(value);
    return Object.freeze(result);
  }
  if (!isPlainObject(value)) {
    details.push(`${path} must contain only plain JSON objects`);
    seen.delete(value);
    return undefined;
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const child = snapshotJson(item, propertyPath(path, key), details, seen);
    if (child !== undefined) result[key] = child;
  }
  seen.delete(value);
  return Object.freeze(result);
}

function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, JsonValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function propertyPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function article(type: JsonSchema["type"]): string {
  return type === "object" || type === "array" || type === "integer"
    ? "an"
    : "a";
}
function formatPrimitive(value: JsonPrimitive): string {
  return JSON.stringify(value);
}
