import type { JsonPrimitive } from "./JsonValue.js";

export interface JsonSchema {
  readonly type:
    | "object"
    | "array"
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "null";
  readonly description?: string;
  readonly enum?: readonly JsonPrimitive[];
  readonly const?: JsonPrimitive;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export type ToolInputSchema = JsonSchema & { readonly type: "object" };
