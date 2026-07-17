export const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
export const TOOL_ERROR_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;

export interface InspectedObject {
  readonly values: Readonly<Record<string, unknown>>;
  readonly keys: readonly string[];
}

export function inspectPlainObject(
  value: unknown,
  path: string,
  details: string[],
): InspectedObject | undefined {
  if (!isPlainObject(value)) {
    details.push(`${path} must be a plain object`);
    return undefined;
  }

  let descriptors: PropertyDescriptorMap;
  let symbols: symbol[];
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    details.push(`${path} properties could not be inspected`);
    return undefined;
  }
  if (symbols.length > 0) details.push(`${path} must not contain symbol keys`);

  const values: Record<string, unknown> = Object.create(null);
  const keys: string[] = [];
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined) continue;
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      details.push(
        `${joinPath(path, key)} must be an enumerable data property`,
      );
      continue;
    }
    keys.push(key);
    values[key] = descriptor.value;
  }
  return { values, keys };
}

export function rejectUnknownKeys(
  inspected: InspectedObject,
  allowed: ReadonlySet<string>,
  path: string,
  details: string[],
): void {
  for (const key of inspected.keys) {
    if (!allowed.has(key)) {
      details.push(`${joinPath(path, key)} is not supported`);
    }
  }
}

export function validateToolName(
  value: unknown,
  path: string,
  details: string[],
): value is string {
  if (typeof value !== "string" || value.length === 0) {
    details.push(`${path} must be a non-empty string`);
    return false;
  }
  if (!TOOL_NAME_PATTERN.test(value)) {
    details.push(`${path} must match ${TOOL_NAME_PATTERN.source}`);
    return false;
  }
  return true;
}

export function validateOpaqueId(
  value: unknown,
  path: string,
  details: string[],
): value is string {
  return validatePreservedString(value, path, 256, details);
}

export function validatePreservedString(
  value: unknown,
  path: string,
  maximumLength: number,
  details: string[],
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    details.push(`${path} must be a non-empty string`);
    return false;
  }
  if (value.length > maximumLength) {
    details.push(`${path} must contain at most ${maximumLength} characters`);
    return false;
  }
  if (value.includes("\0")) {
    details.push(`${path} must not contain NUL characters`);
    return false;
  }
  return true;
}

export function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function joinPath(path: string, key: string): string {
  return path.length === 0 ? key : `${path}.${key}`;
}
