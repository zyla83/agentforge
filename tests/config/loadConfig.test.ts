import { type AgentForgeConfigInput, loadConfig } from "@agentforge/config";
import { InvalidConfigurationError } from "@agentforge/shared";
import { describe, expect, it } from "vitest";

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected the action to throw.");
}

describe("loadConfig", () => {
  it("returns defaults when input is omitted", () => {
    expect(loadConfig()).toEqual({
      instanceName: "default",
      plugins: {},
    });
  });

  it("returns defaults for an empty object", () => {
    expect(loadConfig({})).toEqual({
      instanceName: "default",
      plugins: {},
    });
  });

  it("accepts a valid instance name", () => {
    expect(loadConfig({ instanceName: "desktop-assistant" }).instanceName).toBe(
      "desktop-assistant",
    );
  });

  it("trims surrounding whitespace from the instance name", () => {
    expect(loadConfig({ instanceName: "  assistant  " }).instanceName).toBe(
      "assistant",
    );
  });

  it("rejects an empty instance name", () => {
    expect(() => loadConfig({ instanceName: "" })).toThrow(
      InvalidConfigurationError,
    );
  });

  it("rejects a whitespace-only instance name", () => {
    expect(() => loadConfig({ instanceName: "  \t" })).toThrow(
      InvalidConfigurationError,
    );
  });

  it("rejects unknown top-level keys", () => {
    const input = {
      unknownProperty: true,
    } as unknown as AgentForgeConfigInput;

    expect(() => loadConfig(input)).toThrow(InvalidConfigurationError);
  });

  it("preserves plugin configuration values", () => {
    const pluginConfiguration = {
      connectionString: "local",
      retries: 3,
    };

    const config = loadConfig({
      plugins: { database: pluginConfiguration },
    });

    expect(config.plugins.database).toEqual(pluginConfiguration);
  });

  it("does not mutate the input object", () => {
    const input: AgentForgeConfigInput = {
      instanceName: "  assistant  ",
      plugins: { example: { enabled: true } },
    };

    loadConfig(input);

    expect(input).toEqual({
      instanceName: "  assistant  ",
      plugins: { example: { enabled: true } },
    });
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.plugins)).toBe(false);
  });

  it("freezes the returned top-level configuration", () => {
    expect(Object.isFrozen(loadConfig())).toBe(true);
  });

  it("freezes the returned plugins map", () => {
    expect(Object.isFrozen(loadConfig().plugins)).toBe(true);
  });

  it("throws InvalidConfigurationError on validation failure", () => {
    expect(() => loadConfig({ instanceName: "" })).toThrow(
      InvalidConfigurationError,
    );
  });

  it("preserves the original validation error as cause", () => {
    const error = captureError(() => loadConfig({ instanceName: "" }));

    expect(error).toBeInstanceOf(InvalidConfigurationError);
    expect(error).toMatchObject({ cause: expect.any(Error) });
  });

  it("includes useful paths in validation details", () => {
    const error = captureError(() => loadConfig({ instanceName: "" }));

    expect(error).toMatchObject({
      details: expect.arrayContaining([
        expect.stringMatching(/^instanceName:/),
      ]),
    });
  });

  it("identifies unknown properties in validation details", () => {
    const input = {
      unknownProperty: true,
    } as unknown as AgentForgeConfigInput;
    const error = captureError(() => loadConfig(input));

    expect(error).toMatchObject({
      details: expect.arrayContaining([
        expect.stringMatching(/^unknownProperty:/),
      ]),
    });
  });
});
