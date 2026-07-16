import { AgentProfileError, InvalidAgentProfileError } from "@agentforge/core";
import { describe, expect, it } from "vitest";

describe("AgentProfile errors", () => {
  it("sets explicit names and preserves causes", () => {
    const cause = new Error("cause");
    const base = new AgentProfileError("Profile failed.", { cause });
    const invalid = new InvalidAgentProfileError(["id: invalid"], { cause });

    expect(base).toMatchObject({
      name: "AgentProfileError",
      message: "Profile failed.",
      cause,
    });
    expect(invalid).toMatchObject({
      name: "InvalidAgentProfileError",
      message: "The agent profile is invalid: id: invalid.",
      cause,
    });
    expect(invalid).toBeInstanceOf(AgentProfileError);
  });

  it("copies and freezes validation details", () => {
    const details = ["id: invalid"];
    const error = new InvalidAgentProfileError(details);
    details[0] = "changed";

    expect(error.details).toEqual(["id: invalid"]);
    expect(error.details).not.toBe(details);
    expect(Object.isFrozen(error.details)).toBe(true);
  });
});
