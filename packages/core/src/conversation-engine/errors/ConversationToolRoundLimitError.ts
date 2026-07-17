import { ConversationEngineError } from "./ConversationEngineError.js";

export class ConversationToolRoundLimitError extends ConversationEngineError {
  readonly maxRounds: number;

  constructor(maxRounds: number) {
    super(
      `Conversation tool execution exceeded the maximum of ${maxRounds} provider rounds.`,
    );
    this.name = "ConversationToolRoundLimitError";
    this.maxRounds = maxRounds;
  }
}
