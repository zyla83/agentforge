import pino, {
  type DestinationStream,
  type LoggerOptions as PinoLoggerOptions,
} from "pino";
import type { LogLevel, Logger } from "./Logger.js";
import { PinoLogger } from "./PinoLogger.js";

export interface CreateLoggerOptions {
  readonly level?: LogLevel;
  readonly name?: string;
}

export function createLogger(options?: CreateLoggerOptions): Logger {
  return createPinoLogger(options);
}

// This internal construction path keeps destination streams out of the public API.
export function createLoggerWithDestination(
  options: CreateLoggerOptions | undefined,
  destination: DestinationStream,
): Logger {
  return createPinoLogger(options, destination);
}

function createPinoLogger(
  options?: CreateLoggerOptions,
  destination?: DestinationStream,
): Logger {
  const level = options?.level ?? "info";
  const pinoOptions: PinoLoggerOptions =
    options?.name !== undefined ? { level, name: options.name } : { level };
  const pinoLogger = destination
    ? pino(pinoOptions, destination)
    : pino(pinoOptions);

  return new PinoLogger(pinoLogger);
}
