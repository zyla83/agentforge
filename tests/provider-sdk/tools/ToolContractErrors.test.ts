import {
  InvalidToolCallError,
  InvalidToolDefinitionError,
  InvalidToolResultError,
  ToolContractError,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe.each([
  [
    InvalidToolDefinitionError,
    "InvalidToolDefinitionError",
    "Tool definition is invalid: first detail; second detail.",
  ],
  [
    InvalidToolCallError,
    "InvalidToolCallError",
    "Tool call is invalid: first detail; second detail.",
  ],
  [
    InvalidToolResultError,
    "InvalidToolResultError",
    "Tool result is invalid: first detail; second detail.",
  ],
])("%s", (ErrorClass, name, message) => {
  it("has deterministic hierarchy, name, message, details, and cause", () => {
    const details = ["first detail", "second detail"];
    const cause = new Error("validation cause");
    const error = new ErrorClass(details, { cause });
    details.push("mutated");

    expect(error).toBeInstanceOf(ToolContractError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.message).toBe(message);
    expect(error.details).toEqual(["first detail", "second detail"]);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error.cause).toBe(cause);
  });
});

describe("ToolContractError", () => {
  it("sets its name and preserves a cause", () => {
    const cause = new Error("cause");
    const error = new ToolContractError("Contract failed.", { cause });
    expect(error.name).toBe("ToolContractError");
    expect(error.message).toBe("Contract failed.");
    expect(error.cause).toBe(cause);
  });
});
