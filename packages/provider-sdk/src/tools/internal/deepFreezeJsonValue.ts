import type { JsonValue } from "../JsonValue.js";
import { inspectPlainObject, isPlainObject, joinPath } from "./validation.js";

export function deepCopyAndFreezeJsonValue(
  value: unknown,
  path: string,
  details: string[],
  ancestors: ReadonlySet<object> = new Set<object>(),
): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      details.push(`${path} must contain only finite numbers`);
      return undefined;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return copyArray(value, path, details, ancestors);
  }
  if (isPlainObject(value)) {
    return copyObject(value, path, details, ancestors);
  }
  details.push(`${path} must be valid JSON`);
  return undefined;
}

function copyArray(
  value: unknown[],
  path: string,
  details: string[],
  ancestors: ReadonlySet<object>,
): JsonValue | undefined {
  if (ancestors.has(value)) {
    details.push(`${path} must not contain cyclic values`);
    return undefined;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    details.push(`${path} must not contain symbol keys`);
  }
  const ownKeys = Object.keys(value);
  if (ownKeys.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key))) {
    details.push(`${path} arrays must not contain named properties`);
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  const copy: JsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      details.push(`${path}[${index}] must not be sparse`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      details.push(`${path}[${index}] must be a data property`);
      continue;
    }
    const item = deepCopyAndFreezeJsonValue(
      descriptor.value,
      `${path}[${index}]`,
      details,
      nextAncestors,
    );
    if (item !== undefined) copy.push(item);
  }
  return Object.freeze(copy);
}

function copyObject(
  value: object,
  path: string,
  details: string[],
  ancestors: ReadonlySet<object>,
): JsonValue | undefined {
  if (ancestors.has(value)) {
    details.push(`${path} must not contain cyclic values`);
    return undefined;
  }
  const inspected = inspectPlainObject(value, path, details);
  if (inspected === undefined) return undefined;

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  const copy: Record<string, JsonValue> = Object.create(null);
  for (const key of inspected.keys) {
    const item = deepCopyAndFreezeJsonValue(
      inspected.values[key],
      joinPath(path, key),
      details,
      nextAncestors,
    );
    if (item !== undefined) copy[key] = item;
  }
  return Object.freeze(copy);
}
