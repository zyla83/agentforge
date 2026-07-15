import { Writable } from "node:stream";
import { createLogger } from "@agentforge/logger";
import { describe, expect, it } from "vitest";
import { createLoggerWithDestination } from "../../packages/logger/src/createLogger.js";

const logMethods = ["trace", "debug", "info", "warn", "error"] as const;

describe("createLogger", () => {
  it("returns an object implementing the logger contract", () => {
    const logger = createLogger({ level: "silent" });

    for (const method of logMethods) {
      expect(logger[method]).toBeTypeOf("function");
    }
    expect(logger.child).toBeTypeOf("function");
  });

  it("supports every log method without context", () => {
    const logger = createLogger({ level: "silent" });

    for (const method of logMethods) {
      expect(() => logger[method]("message")).not.toThrow();
    }
  });

  it("supports every log method with structured context", () => {
    const logger = createLogger({ level: "silent" });

    for (const method of logMethods) {
      expect(() =>
        logger[method]("message", { requestId: "request-1" }),
      ).not.toThrow();
    }
  });

  it("creates usable child loggers", () => {
    const child = createLogger({ level: "silent" }).child({
      component: "test",
    });

    expect(() => child.info("child message", { value: 1 })).not.toThrow();
  });

  it("suppresses output at the silent level", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLoggerWithDestination(
      { level: "silent" },
      destination,
    );

    logger.error("suppressed", { error: new Error("failure") });

    expect(output).toBe("");
  });
});
