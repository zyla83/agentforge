export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;

  child(bindings: LogContext): Logger;
}
