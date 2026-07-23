import { describe, expect, it } from "vitest";
import { ChatCommandType } from "../../../examples/chat-cli/src/ChatCommand.js";
import type { ChatCommandParseError } from "../../../examples/chat-cli/src/ChatCommandParseError.js";
import { parseChatCommand } from "../../../examples/chat-cli/src/parseChatCommand.js";

describe("parseChatCommand", () => {
  it.each([
    ["/exit", ChatCommandType.Exit],
    ["/quit", ChatCommandType.Exit],
    ["/reset", ChatCommandType.Reset],
    ["/help", ChatCommandType.Help],
    ["/info", ChatCommandType.Info],
    ["/save", ChatCommandType.Save],
    ["/list", ChatCommandType.List],
    [" /QUIT ", ChatCommandType.Exit],
    ["/HeLp", ChatCommandType.Help],
  ])("parses %s", (input, type) => {
    const command = parseChatCommand(input);
    expect(command).toEqual({ type });
    expect(Object.isFrozen(command)).toBe(true);
  });

  it.each([
    [
      "/load conversation-1",
      { type: ChatCommandType.Load, conversationId: "conversation-1" },
    ],
    [
      "/LOAD 'conversation with spaces'",
      {
        type: ChatCommandType.Load,
        conversationId: "conversation with spaces",
      },
    ],
    ["/delete id", { type: ChatCommandType.Delete, conversationId: "id" }],
    [
      "/export ./backup.json",
      { type: ChatCommandType.Export, filePath: "./backup.json" },
    ],
    [
      "/export C:\\My Data\\chat.json",
      { type: ChatCommandType.Export, filePath: "C:\\My Data\\chat.json" },
    ],
    [
      '/export "C:\\My Data\\chat.json"',
      { type: ChatCommandType.Export, filePath: "C:\\My Data\\chat.json" },
    ],
    [
      "/import './exports/conversation one.json'",
      {
        type: ChatCommandType.Import,
        filePath: "./exports/conversation one.json",
      },
    ],
    ["/voice 1", { type: ChatCommandType.Voice, durationSeconds: 1 }],
    ["/VOICE 30", { type: ChatCommandType.Voice, durationSeconds: 30 }],
  ])("parses argument command %s", (input, expected) => {
    const command = parseChatCommand(input);
    expect(command).toEqual(expected);
    expect(Object.isFrozen(command)).toBe(true);
  });

  it("parses /voice without a duration as a frozen default command", () => {
    const command = parseChatCommand("/voice");
    expect(command).toEqual({ type: ChatCommandType.Voice });
    expect(Object.isFrozen(command)).toBe(true);
  });

  it.each(["", "   ", "hello", " not-a-command without slash "])(
    "leaves %j as normal input",
    (input) => expect(parseChatCommand(input)).toBeUndefined(),
  );

  it.each([
    [
      "/unknown",
      'Unknown command "/unknown". Type /help for available commands.',
    ],
    ["/help me", "Unexpected argument for /help."],
    ["/save now", "Unexpected argument for /save."],
    ["/load", "Usage: /load <conversation-id>"],
    ["/load one two", "Usage: /load <conversation-id>"],
    ["/delete '   '", "Usage: /delete <conversation-id>"],
    ["/export", "Usage: /export <file-path>"],
    ['/import "missing', "Usage: /import <file-path>"],
    ["/export 'one' trailing", "Usage: /export <file-path>"],
    ["/voice 0", "Usage: /voice [seconds] (1-30)"],
    ["/voice 31", "Usage: /voice [seconds] (1-30)"],
    ["/voice +5", "Usage: /voice [seconds] (1-30)"],
    ["/voice -5", "Usage: /voice [seconds] (1-30)"],
    ["/voice 5.0", "Usage: /voice [seconds] (1-30)"],
    ["/voice 5s", "Usage: /voice [seconds] (1-30)"],
    ["/voice 5 extra", "Usage: /voice [seconds] (1-30)"],
    ['/voice ""', "Usage: /voice [seconds] (1-30)"],
  ])("rejects malformed command %s", (input, message) => {
    expect(() => parseChatCommand(input)).toThrow(
      expect.objectContaining<Partial<ChatCommandParseError>>({ message }),
    );
  });

  it("does not mutate input", () => {
    const input = "  /HELP  ";
    parseChatCommand(input);
    expect(input).toBe("  /HELP  ");
  });
});
