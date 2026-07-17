import type { JsonObject, JsonValue } from "../JsonValue.js";
import { deepCopyAndFreezeJsonValue } from "./deepFreezeJsonValue.js";
import { isPlainObject } from "./validation.js";

export function snapshotJsonValue(
  value: unknown,
  path: string,
  details: string[],
): JsonValue | undefined {
  return deepCopyAndFreezeJsonValue(value, path, details);
}

export function snapshotJsonObject(
  value: unknown,
  path: string,
  details: string[],
): JsonObject | undefined {
  if (!isPlainObject(value)) {
    details.push(`${path} must be a plain JSON object`);
    return undefined;
  }
  return deepCopyAndFreezeJsonValue(value, path, details) as
    | JsonObject
    | undefined;
}
