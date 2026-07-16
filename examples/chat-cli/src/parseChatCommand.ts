import { ChatCommandType } from "./ChatCommand.js";
import type { ChatCommand } from "./ChatCommand.js";

const COMMANDS = new Map<string, ChatCommandType>([
  ["/exit", ChatCommandType.Exit],
  ["/quit", ChatCommandType.Exit],
  ["/reset", ChatCommandType.Reset],
  ["/help", ChatCommandType.Help],
  ["/info", ChatCommandType.Info],
]);

export function parseChatCommand(
  input: string,
): Readonly<ChatCommand> | undefined {
  if (typeof input !== "string") return undefined;
  const type = COMMANDS.get(input.trim().toLowerCase());
  return type === undefined ? undefined : Object.freeze({ type });
}
