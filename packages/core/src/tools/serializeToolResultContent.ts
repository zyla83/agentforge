import type { JsonValue, ToolResult } from "@agentforge/provider-sdk";

export function serializeToolResultContent(
  result: Readonly<ToolResult>,
): string {
  const value: JsonValue =
    result.status === "success"
      ? { status: "success", output: result.output }
      : {
          status: "error",
          error: {
            code: result.error.code,
            message: result.error.message,
            ...(result.error.details === undefined
              ? {}
              : { details: result.error.details }),
          },
        };
  return JSON.stringify(sortJson(value));
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  const object = value as Readonly<Record<string, JsonValue>>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, sortJson(object[key] as JsonValue)]),
  );
}
