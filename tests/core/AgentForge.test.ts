import { describe, expect, it } from "vitest";
import { AgentForge } from "../../packages/core/src";

describe("AgentForge", () => {
  it("starts without registered plugins", () => {
    const agent = new AgentForge();

    expect(agent.getPluginCount()).toBe(0);
  });
});
