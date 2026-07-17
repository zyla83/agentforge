import type {
  OllamaJsonObject,
  OllamaJsonValue,
} from "@agentforge/ollama-client";
import type {
  JsonObject,
  JsonValue,
  ToolInputSchema,
} from "@agentforge/provider-sdk";

export function mapJsonObjectToOllama(
  value: Readonly<JsonObject> | Readonly<ToolInputSchema>,
): Readonly<OllamaJsonObject> {
  return mapObject(value, new WeakSet()) as Readonly<OllamaJsonObject>;
}

export function mapOllamaJsonObject(
  value: Readonly<OllamaJsonObject>,
): Readonly<JsonObject> {
  return mapObject(value, new WeakSet()) as Readonly<JsonObject>;
}

function mapObject(
  value: object,
  active: WeakSet<object>,
): Readonly<Record<string, JsonValue | OllamaJsonValue>> {
  if (!isPlainObject(value) || active.has(value)) throwInvariantError();
  active.add(value);
  const result: Record<string, JsonValue | OllamaJsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = mapValue(child, active);
  }
  active.delete(value);
  return Object.freeze(result);
}

function mapValue(
  value: unknown,
  active: WeakSet<object>,
): JsonValue | OllamaJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throwInvariantError();
  }
  if (Array.isArray(value)) {
    if (active.has(value)) throwInvariantError();
    active.add(value);
    const result: (JsonValue | OllamaJsonValue)[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throwInvariantError();
      result.push(mapValue(value[index], active));
    }
    active.delete(value);
    return Object.freeze(result);
  }
  if (isPlainObject(value)) return mapObject(value, active);
  throwInvariantError();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function throwInvariantError(): never {
  throw new TypeError("Ollama JSON mapping invariant failed.");
}
