import {
  ConversationTurnAbortedError,
  type ConversationTurnExecutionPhase,
} from "../errors/index.js";

export function throwIfConversationTurnAborted(
  signal: AbortSignal | undefined,
  phase: ConversationTurnExecutionPhase,
): void {
  if (!signal?.aborted) return;
  throw new ConversationTurnAbortedError(phase, { reason: signal.reason });
}
