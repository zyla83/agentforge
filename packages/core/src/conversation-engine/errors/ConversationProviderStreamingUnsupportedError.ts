import { ConversationEngineError } from "./ConversationEngineError.js";

export class ConversationProviderStreamingUnsupportedError extends ConversationEngineError {
  readonly provider: string;

  constructor(provider: string, options?: ErrorOptions) {
    super(`LLM provider "${provider}" does not support streaming.`, options);
    this.name = "ConversationProviderStreamingUnsupportedError";
    this.provider = provider;
  }
}
