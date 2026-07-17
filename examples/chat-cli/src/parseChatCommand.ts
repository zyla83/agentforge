import { ChatCommandType } from "./ChatCommand.js";
import type { ChatCommand } from "./ChatCommand.js";
import { ChatCommandParseError } from "./ChatCommandParseError.js";
import {
  parseFilePathArgument,
  parseSingleCommandArgument,
} from "./commands/parseCommandArguments.js";

type NoArgumentCommandType =
  | ChatCommandType.Exit
  | ChatCommandType.Reset
  | ChatCommandType.Help
  | ChatCommandType.Info
  | ChatCommandType.Save
  | ChatCommandType.List;

const NO_ARGUMENT_COMMANDS = new Map<string, NoArgumentCommandType>([
  ["exit", ChatCommandType.Exit],
  ["quit", ChatCommandType.Exit],
  ["reset", ChatCommandType.Reset],
  ["help", ChatCommandType.Help],
  ["info", ChatCommandType.Info],
  ["save", ChatCommandType.Save],
  ["list", ChatCommandType.List],
]);

export function parseChatCommand(
  input: string,
): Readonly<ChatCommand> | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return undefined;

  const separator = trimmed.search(/\s/u);
  const name = trimmed
    .slice(1, separator < 0 ? undefined : separator)
    .toLowerCase();
  const argumentText = separator < 0 ? "" : trimmed.slice(separator).trim();
  const noArgumentType = NO_ARGUMENT_COMMANDS.get(name);
  if (noArgumentType !== undefined) {
    if (argumentText.length > 0) {
      throw new ChatCommandParseError(`Unexpected argument for /${name}.`);
    }
    return Object.freeze({ type: noArgumentType });
  }

  if (name === ChatCommandType.Load || name === ChatCommandType.Delete) {
    const conversationId = parseSingleCommandArgument(
      argumentText,
      `/${name} <conversation-id>`,
    );
    return Object.freeze({ type: name, conversationId });
  }
  if (name === ChatCommandType.Export || name === ChatCommandType.Import) {
    const filePath = parseFilePathArgument(
      argumentText,
      `/${name} <file-path>`,
    );
    return Object.freeze({ type: name, filePath });
  }

  const displayName = name.length === 0 ? "/" : `/${name}`;
  throw new ChatCommandParseError(
    `Unknown command "${displayName}". Type /help for available commands.`,
  );
}
