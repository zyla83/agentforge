import {
  type JsonValue,
  type ToolArguments,
  type ToolExecutionContext,
  createToolDefinition,
} from "@agentforge/provider-sdk";

export type TextFormat = "uppercase" | "lowercase" | "title_case";

export interface FormatTextArguments extends ToolArguments {
  readonly values: readonly string[];
  readonly format: TextFormat;
  readonly separator?: string;
  readonly trim?: boolean;
}

export interface FormatTextOutput extends Readonly<Record<string, JsonValue>> {
  readonly values: readonly string[];
  readonly format: TextFormat;
  readonly separator: string;
  readonly trim: boolean;
  readonly text: string;
}

export const formatTextToolDefinition = createToolDefinition({
  name: "format_text",
  description:
    "Transform text using a selected format and optionally join multiple values.",
  inputSchema: {
    type: "object",
    properties: {
      values: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 1,
        maxItems: 20,
      },
      format: {
        type: "string",
        enum: ["uppercase", "lowercase", "title_case"],
      },
      separator: { type: "string", maxLength: 10 },
      trim: { type: "boolean" },
    },
    required: ["values", "format"],
    additionalProperties: false,
  },
});

export function formatTextToolHandler(
  argumentsValue: Readonly<FormatTextArguments>,
  context: Readonly<ToolExecutionContext>,
): Promise<FormatTextOutput>;
export function formatTextToolHandler(
  argumentsValue: ToolArguments,
  context: Readonly<ToolExecutionContext>,
): Promise<JsonValue>;
export async function formatTextToolHandler(
  argumentsValue: ToolArguments,
  _context: Readonly<ToolExecutionContext>,
): Promise<FormatTextOutput> {
  const values = readValues(argumentsValue.values);
  const format = readFormat(argumentsValue.format);
  const separator = readOptionalString(argumentsValue.separator) ?? " ";
  const trim = readOptionalBoolean(argumentsValue.trim) ?? true;
  const transformedValues = Object.freeze(
    values.map((value) => transformValue(trim ? value.trim() : value, format)),
  );
  return Object.freeze({
    values: transformedValues,
    format,
    separator,
    trim,
    text: transformedValues.join(separator),
  });
}

function transformValue(value: string, format: TextFormat): string {
  switch (format) {
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "title_case":
      return toSimpleTitleCase(value);
  }
}

function toSimpleTitleCase(value: string): string {
  let result = "";
  let wordStart = true;
  for (const character of value.toLowerCase()) {
    if (/\s/u.test(character)) {
      result += character;
      wordStart = true;
    } else {
      result += wordStart ? character.toUpperCase() : character;
      wordStart = false;
    }
  }
  return result;
}

function readValues(value: JsonValue | undefined): readonly string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw new Error("Format-text values must be strings.");
}

function readFormat(value: JsonValue | undefined): TextFormat {
  if (
    value === "uppercase" ||
    value === "lowercase" ||
    value === "title_case"
  ) {
    return value;
  }
  throw new Error("Unsupported text format.");
}

function readOptionalString(value: JsonValue | undefined): string | undefined {
  if (value === undefined || typeof value === "string") return value;
  throw new Error("Format-text separator must be a string.");
}

function readOptionalBoolean(
  value: JsonValue | undefined,
): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  throw new Error("Format-text trim must be a boolean.");
}
