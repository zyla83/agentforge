export interface ConversationTurnController {
  readonly signal: AbortSignal;
  readonly aborted: boolean;
  readonly reason: unknown;

  abort(reason?: unknown): void;
}
