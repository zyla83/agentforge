import { describe, expect, it } from "vitest";
import { AgentForge } from "../../packages/core/src";

describe("AgentForge", () => {
  it("has no registered plugins initially", () => {
    const agent = new AgentForge();

    expect(agent.getPluginCount()).toBe(0);
  });

  it("starts without registered plugins", async () => {
    const agent = new AgentForge();

    await expect(agent.start()).resolves.toBeUndefined();
  });
});
