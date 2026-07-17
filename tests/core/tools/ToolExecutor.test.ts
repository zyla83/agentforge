import { ToolExecutionAbortedError, ToolExecutorImpl } from "@agentforge/core";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolHandler,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";
import { ToolRegistryImpl } from "../../../packages/core/src/tools/ToolRegistryImpl.js";

const definition: ToolDefinition = {
  name: "calculator",
  description: "Calculate a value.",
  inputSchema: {
    type: "object",
    required: ["value"],
    additionalProperties: false,
    properties: { value: { type: "number" } },
  },
};

function call(argumentsValue: Record<string, unknown> = { value: 2 }) {
  return {
    id: "call-1",
    name: "calculator",
    arguments: argumentsValue,
  } as never;
}

describe("ToolExecutorImpl", () => {
  it("executes once with immutable arguments, metadata, and exact signal", async () => {
    const registry = new ToolRegistryImpl();
    const controller = new AbortController();
    const contexts: Readonly<ToolExecutionContext>[] = [];
    let calls = 0;
    registry.register(definition, async (argumentsValue, context) => {
      calls += 1;
      contexts.push(context);
      expect(Object.isFrozen(argumentsValue)).toBe(true);
      return { doubled: (argumentsValue.value as number) * 2 };
    });
    const result = await new ToolExecutorImpl(registry.getView()).execute(
      call(),
      {
        signal: controller.signal,
        metadata: { trace: "turn-1" },
      },
    );
    expect(result).toEqual({
      toolCallId: "call-1",
      toolName: "calculator",
      status: "success",
      output: { doubled: 4 },
    });
    expect(calls).toBe(1);
    expect(contexts[0]?.signal).toBe(controller.signal);
    expect(contexts[0]?.metadata).toEqual({ trace: "turn-1" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns controlled failures for missing tools and invalid arguments", async () => {
    const registry = new ToolRegistryImpl();
    const missing = await new ToolExecutorImpl(registry.getView()).execute(
      call(),
    );
    let invoked = false;
    registry.register(definition, async () => {
      invoked = true;
      return null;
    });
    const invalid = await new ToolExecutorImpl(registry.getView()).execute(
      call({ value: "2" }),
    );
    expect(missing).toMatchObject({
      status: "error",
      error: { code: "tool_not_found" },
    });
    expect(invalid).toMatchObject({
      status: "error",
      error: {
        code: "invalid_arguments",
        details: { errors: ["arguments.value must be a number"] },
      },
    });
    expect(invoked).toBe(false);
  });

  it.each([
    [
      "throws",
      async () => {
        throw new Error("secret exception");
      },
      "tool_execution_failed",
    ],
    ["returns undefined", async () => undefined, "invalid_tool_output"],
    ["returns NaN", async () => Number.NaN, "invalid_tool_output"],
    ["returns Date", async () => new Date(), "invalid_tool_output"],
  ] as const)(
    "converts a handler that %s into a safe failure",
    async (_name, handler, code) => {
      const registry = new ToolRegistryImpl();
      registry.register(definition, handler as unknown as ToolHandler);
      const result = await new ToolExecutorImpl(registry.getView()).execute(
        call(),
      );
      expect(result).toMatchObject({ status: "error", error: { code } });
      expect(JSON.stringify(result)).not.toContain("secret exception");
      expect(JSON.stringify(result)).not.toContain("stack");
    },
  );

  it.each([null, "done", 42, { nested: [true, null] }])(
    "accepts JSON output %j",
    async (output) => {
      const registry = new ToolRegistryImpl();
      registry.register(definition, async () => output);
      const result = await new ToolExecutorImpl(registry.getView()).execute(
        call(),
      );
      expect(result).toMatchObject({ status: "success", output });
    },
  );

  it("aborts before execution and after a handler observes cancellation", async () => {
    const pre = new AbortController();
    pre.abort("before");
    await expect(
      new ToolExecutorImpl(new ToolRegistryImpl().getView()).execute(call(), {
        signal: pre.signal,
      }),
    ).rejects.toMatchObject({
      name: "ToolExecutionAbortedError",
      reason: "before",
    });

    const during = new AbortController();
    const registry = new ToolRegistryImpl();
    registry.register(definition, async () => {
      during.abort("during");
      return null;
    });
    await expect(
      new ToolExecutorImpl(registry.getView()).execute(call(), {
        signal: during.signal,
      }),
    ).rejects.toBeInstanceOf(ToolExecutionAbortedError);
  });
});
