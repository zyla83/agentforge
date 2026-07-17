import { ChatCommandParseError } from "../ChatCommandParseError.js";

export function parseSingleCommandArgument(
  value: string,
  usage: string,
): string {
  const argument = value.trim();
  if (argument.length === 0) throw new ChatCommandParseError(`Usage: ${usage}`);

  if (argument.startsWith('"') || argument.startsWith("'")) {
    return parseQuotedArgument(argument, usage);
  }
  if (
    argument.includes('"') ||
    argument.includes("'") ||
    /\s/u.test(argument)
  ) {
    throw new ChatCommandParseError(`Usage: ${usage}`);
  }
  return argument;
}

export function parseFilePathArgument(value: string, usage: string): string {
  const argument = value.trim();
  if (argument.length === 0) throw new ChatCommandParseError(`Usage: ${usage}`);

  if (argument.startsWith('"') || argument.startsWith("'")) {
    return parseQuotedArgument(argument, usage);
  }
  if (argument.includes('"') || argument.includes("'")) {
    throw new ChatCommandParseError(`Usage: ${usage}`);
  }
  return argument;
}

function parseQuotedArgument(value: string, usage: string): string {
  const quote = value[0] as string;
  const closingIndex = value.indexOf(quote, 1);
  if (closingIndex < 0 || value.slice(closingIndex + 1).trim().length > 0) {
    throw new ChatCommandParseError(`Usage: ${usage}`);
  }
  const decoded = value.slice(1, closingIndex);
  if (decoded.trim().length === 0) {
    throw new ChatCommandParseError(`Usage: ${usage}`);
  }
  return decoded;
}
