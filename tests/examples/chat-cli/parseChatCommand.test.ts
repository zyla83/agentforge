import { describe, expect, it } from "vitest";
import { ChatCommandType } from "../../../examples/chat-cli/src/ChatCommand.js";
import { parseChatCommand } from "../../../examples/chat-cli/src/parseChatCommand.js";

describe("parseChatCommand", () => {
  it.each([
    ["/exit", ChatCommandType.Exit],
    ["/quit", ChatCommandType.Exit],
    ["/reset", ChatCommandType.Reset],
    ["/help", ChatCommandType.Help],
    ["/info", ChatCommandType.Info],
    [" /QUIT ", ChatCommandType.Exit],
    ["/HeLp", ChatCommandType.Help],
  ])("parses %s", (input, type) => {
    const command = parseChatCommand(input);
    expect(command).toEqual({ type });
    expect(Object.isFrozen(command)).toBe(true);
  });

  it.each(["", "   ", "/unknown", "/help me", "/info now", "/hello"])(
    "leaves %j as normal input",
    (input) => {
      expect(parseChatCommand(input)).toBeUndefined();
    },
  );

  it("does not mutate input", () => {
    const input = "  /HELP  ";
    parseChatCommand(input);
    expect(input).toBe("  /HELP  ");
  });
});
