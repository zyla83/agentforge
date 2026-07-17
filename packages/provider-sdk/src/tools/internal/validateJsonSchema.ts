import type { JsonSchema, ToolInputSchema } from "../JsonSchema.js";
import type { JsonPrimitive } from "../JsonValue.js";
import {
  inspectPlainObject,
  joinPath,
  rejectUnknownKeys,
} from "./validation.js";

const SCHEMA_TYPES = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);
const COMMON_KEYS = ["type", "description", "enum", "const"] as const;
const TYPE_KEYS: Readonly<Record<string, readonly string[]>> = {
  object: ["properties", "required", "additionalProperties"],
  array: ["items", "minItems", "maxItems"],
  string: ["minLength", "maxLength"],
  number: ["minimum", "maximum"],
  integer: ["minimum", "maximum"],
  boolean: [],
  null: [],
};
const ALL_KEYS = new Set([...COMMON_KEYS, ...Object.values(TYPE_KEYS).flat()]);

export function snapshotJsonSchema(
  value: unknown,
  path: string,
  details: string[],
  ancestors: ReadonlySet<object> = new Set<object>(),
): Readonly<JsonSchema> | undefined {
  const inspected = inspectPlainObject(value, path, details);
  if (inspected === undefined) return undefined;
  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    details.push(`${path} must not contain cyclic schemas`);
    return undefined;
  }
  rejectUnknownKeys(inspected, ALL_KEYS, path, details);

  const typeValue = inspected.values.type;
  const type =
    typeof typeValue === "string" && SCHEMA_TYPES.has(typeValue)
      ? typeValue
      : undefined;
  if (typeValue === undefined) details.push(`${path}.type is required`);
  else if (type === undefined) details.push(`${path}.type is not supported`);

  if (
    inspected.values.description !== undefined &&
    typeof inspected.values.description !== "string"
  ) {
    details.push(`${path}.description must be a string`);
  }

  if (type !== undefined) {
    const compatibleKeys = new Set([
      ...COMMON_KEYS,
      ...(TYPE_KEYS[type] ?? []),
    ]);
    for (const key of inspected.keys) {
      if (ALL_KEYS.has(key) && !compatibleKeys.has(key)) {
        details.push(`${joinPath(path, key)} is not valid for type "${type}"`);
      }
    }
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(objectValue);
  const enumValue = validateEnum(
    inspected.values.enum,
    type,
    `${path}.enum`,
    details,
  );
  const constValue = validateConst(inspected, type, `${path}.const`, details);
  const primitiveConst = constValue.value;
  if (
    enumValue !== undefined &&
    constValue.present &&
    primitiveConst !== undefined &&
    !enumValue.some((item) => primitiveEquals(item, primitiveConst))
  ) {
    details.push(`${path}.const must be included in ${path}.enum`);
  }

  const snapshot: Record<string, unknown> = { type };
  if (typeof inspected.values.description === "string") {
    snapshot.description = inspected.values.description;
  }
  if (enumValue !== undefined) snapshot.enum = enumValue;
  if (constValue.present && constValue.value !== undefined) {
    snapshot.const = constValue.value;
  } else if (constValue.present && inspected.values.const === null) {
    snapshot.const = null;
  }

  if (type === "object") {
    copyObjectKeywords(
      inspected.values,
      snapshot,
      path,
      details,
      nextAncestors,
    );
  } else if (type === "array") {
    copyArrayKeywords(inspected.values, snapshot, path, details, nextAncestors);
  } else if (type === "string") {
    copyIntegerLimits(
      inspected.values,
      snapshot,
      path,
      details,
      "minLength",
      "maxLength",
    );
  } else if (type === "number" || type === "integer") {
    copyNumberLimits(inspected.values, snapshot, path, details);
  }

  return deepFreezeSchema(snapshot as unknown as JsonSchema);
}

export function snapshotToolInputSchema(
  value: unknown,
  path: string,
  details: string[],
): Readonly<ToolInputSchema> | undefined {
  const schema = snapshotJsonSchema(value, path, details);
  if (schema !== undefined && schema.type !== "object") {
    details.push(`${path}.type must equal "object"`);
    return undefined;
  }
  return schema as Readonly<ToolInputSchema> | undefined;
}

function copyObjectKeywords(
  values: Readonly<Record<string, unknown>>,
  snapshot: Record<string, unknown>,
  path: string,
  details: string[],
  ancestors: ReadonlySet<object>,
): void {
  const propertySchemas: Record<string, Readonly<JsonSchema>> = Object.create(
    null,
  );
  const propertyNames = new Set<string>();
  if (values.properties !== undefined) {
    const properties = inspectPlainObject(
      values.properties,
      `${path}.properties`,
      details,
    );
    if (properties !== undefined) {
      const propertiesObject = values.properties as object;
      if (ancestors.has(propertiesObject)) {
        details.push(`${path}.properties must not contain cyclic schemas`);
      } else {
        const propertyAncestors = new Set(ancestors);
        propertyAncestors.add(propertiesObject);
        for (const name of properties.keys) {
          if (name.length === 0) {
            details.push(`${path}.properties property names must be non-empty`);
            continue;
          }
          propertyNames.add(name);
          const schema = snapshotJsonSchema(
            properties.values[name],
            `${path}.properties.${name}`,
            details,
            propertyAncestors,
          );
          if (schema !== undefined) propertySchemas[name] = schema;
        }
        snapshot.properties = Object.freeze(propertySchemas);
      }
    }
  }

  if (values.required !== undefined) {
    const required = validateRequired(
      values.required,
      propertyNames,
      `${path}.required`,
      details,
    );
    if (required !== undefined) snapshot.required = required;
  }

  if (values.additionalProperties !== undefined) {
    if (typeof values.additionalProperties === "boolean") {
      snapshot.additionalProperties = values.additionalProperties;
    } else {
      const schema = snapshotJsonSchema(
        values.additionalProperties,
        `${path}.additionalProperties`,
        details,
        ancestors,
      );
      if (schema !== undefined) snapshot.additionalProperties = schema;
    }
  }
}

function copyArrayKeywords(
  values: Readonly<Record<string, unknown>>,
  snapshot: Record<string, unknown>,
  path: string,
  details: string[],
  ancestors: ReadonlySet<object>,
): void {
  if (values.items === undefined) {
    details.push(`${path}.items is required for array schemas`);
  } else {
    const items = snapshotJsonSchema(
      values.items,
      `${path}.items`,
      details,
      ancestors,
    );
    if (items !== undefined) snapshot.items = items;
  }
  copyIntegerLimits(values, snapshot, path, details, "minItems", "maxItems");
}

function copyIntegerLimits(
  values: Readonly<Record<string, unknown>>,
  snapshot: Record<string, unknown>,
  path: string,
  details: string[],
  minimumKey: "minItems" | "minLength",
  maximumKey: "maxItems" | "maxLength",
): void {
  const minimum = validateNonNegativeInteger(
    values[minimumKey],
    `${path}.${minimumKey}`,
    details,
  );
  const maximum = validateNonNegativeInteger(
    values[maximumKey],
    `${path}.${maximumKey}`,
    details,
  );
  if (minimum !== undefined) snapshot[minimumKey] = minimum;
  if (maximum !== undefined) snapshot[maximumKey] = maximum;
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    details.push(
      `${path}.${minimumKey} must be less than or equal to ${path}.${maximumKey}`,
    );
  }
}

function copyNumberLimits(
  values: Readonly<Record<string, unknown>>,
  snapshot: Record<string, unknown>,
  path: string,
  details: string[],
): void {
  const minimum = validateFiniteNumber(
    values.minimum,
    `${path}.minimum`,
    details,
  );
  const maximum = validateFiniteNumber(
    values.maximum,
    `${path}.maximum`,
    details,
  );
  if (minimum !== undefined) snapshot.minimum = minimum;
  if (maximum !== undefined) snapshot.maximum = maximum;
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    details.push(
      `${path}.minimum must be less than or equal to ${path}.maximum`,
    );
  }
}

function validateEnum(
  value: unknown,
  type: string | undefined,
  path: string,
  details: string[],
): readonly JsonPrimitive[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    details.push(`${path} must be a non-empty array`);
    return undefined;
  }
  const snapshot: JsonPrimitive[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      details.push(`${path}[${index}] must not be sparse`);
      continue;
    }
    const item = value[index];
    if (!isJsonPrimitive(item)) {
      details.push(`${path}[${index}] must be a JSON primitive`);
      continue;
    }
    if (type !== undefined && !primitiveMatchesType(item, type)) {
      details.push(`${path}[${index}] must match schema type "${type}"`);
    }
    const key = primitiveKey(item);
    if (seen.has(key))
      details.push(`${path}[${index}] must not duplicate another value`);
    else seen.add(key);
    snapshot.push(item);
  }
  return Object.freeze(snapshot);
}

function validateConst(
  inspected: {
    readonly values: Readonly<Record<string, unknown>>;
    readonly keys: readonly string[];
  },
  type: string | undefined,
  path: string,
  details: string[],
): { readonly present: boolean; readonly value?: JsonPrimitive } {
  if (!inspected.keys.includes("const")) return { present: false };
  const value = inspected.values.const;
  if (!isJsonPrimitive(value)) {
    details.push(`${path} must be a JSON primitive`);
    return { present: true };
  }
  if (type !== undefined && !primitiveMatchesType(value, type)) {
    details.push(`${path} must match schema type "${type}"`);
  }
  return { present: true, value };
}

function validateRequired(
  value: unknown,
  propertyNames: ReadonlySet<string>,
  path: string,
  details: string[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    details.push(`${path} must be an array`);
    return undefined;
  }
  const snapshot: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || item.length === 0) {
      details.push(`${path}[${index}] must be a non-empty string`);
      continue;
    }
    if (seen.has(item)) details.push(`${path}[${index}] must be unique`);
    else seen.add(item);
    if (!propertyNames.has(item)) {
      details.push(`${path}[${index}] must reference a declared property`);
    }
    snapshot.push(item);
  }
  return Object.freeze(snapshot);
}

function validateNonNegativeInteger(
  value: unknown,
  path: string,
  details: string[],
): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    (value as number) < 0
  ) {
    details.push(`${path} must be a non-negative finite integer`);
    return undefined;
  }
  return value as number;
}

function validateFiniteNumber(
  value: unknown,
  path: string,
  details: string[],
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    details.push(`${path} must be a finite number`);
    return undefined;
  }
  return value;
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function primitiveMatchesType(value: JsonPrimitive, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  if (type === "number") return typeof value === "number";
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

function primitiveKey(value: JsonPrimitive): string {
  if (typeof value === "number" && Object.is(value, -0)) return "number:0";
  return `${typeof value}:${String(value)}`;
}

function primitiveEquals(left: JsonPrimitive, right: JsonPrimitive): boolean {
  return primitiveKey(left) === primitiveKey(right);
}

function deepFreezeSchema(schema: JsonSchema): Readonly<JsonSchema> {
  return Object.freeze(schema);
}
