import type { Logger as PinoInstance } from "pino";
import type { LogContext, Logger } from "./Logger.js";

export class PinoLogger implements Logger {
  constructor(private readonly pinoLogger: PinoInstance) {}

  trace(message: string, context?: LogContext): void {
    context
      ? this.pinoLogger.trace(context, message)
      : this.pinoLogger.trace(message);
  }

  debug(message: string, context?: LogContext): void {
    context
      ? this.pinoLogger.debug(context, message)
      : this.pinoLogger.debug(message);
  }

  info(message: string, context?: LogContext): void {
    context
      ? this.pinoLogger.info(context, message)
      : this.pinoLogger.info(message);
  }

  warn(message: string, context?: LogContext): void {
    context
      ? this.pinoLogger.warn(context, message)
      : this.pinoLogger.warn(message);
  }

  error(message: string, context?: LogContext): void {
    context
      ? this.pinoLogger.error(context, message)
      : this.pinoLogger.error(message);
  }

  child(bindings: LogContext): Logger {
    return new PinoLogger(this.pinoLogger.child({ ...bindings }));
  }
}
