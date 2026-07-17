import { ConversationEngineError } from "./ConversationEngineError.js";

export class ConversationToolProtocolError extends ConversationEngineError {
  readonly provider: string;

  constructor(provider: string, detail: string, options?: ErrorOptions) {
    super(
      `LLM provider "${provider}" tool protocol is invalid: ${detail}.`,
      options,
    );
    this.name = "ConversationToolProtocolError";
    this.provider = provider;
  }
}
