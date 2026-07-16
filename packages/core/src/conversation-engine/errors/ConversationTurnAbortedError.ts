import { ConversationEngineError } from "./ConversationEngineError.js";
import type { ConversationTurnExecutionPhase } from "./ConversationTurnExecutionError.js";

export class ConversationTurnAbortedError extends ConversationEngineError {
  readonly phase: ConversationTurnExecutionPhase;
  readonly reason: unknown;

  constructor(
    phase: ConversationTurnExecutionPhase,
    options?: {
      readonly reason?: unknown;
      readonly cause?: unknown;
    },
  ) {
    const reason = options?.reason;
    const cause = options?.cause ?? reason;
    super(
      `Conversation turn was aborted during ${phase}.`,
      cause === undefined ? undefined : { cause },
    );
    this.name = "ConversationTurnAbortedError";
    this.phase = phase;
    this.reason = reason;
  }
}
