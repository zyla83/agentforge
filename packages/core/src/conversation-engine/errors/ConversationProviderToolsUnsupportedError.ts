import { ConversationEngineError } from "./ConversationEngineError.js";

export class ConversationProviderToolsUnsupportedError extends ConversationEngineError {
  readonly provider: string;

  constructor(provider: string) {
    super(`LLM provider "${provider}" does not support tool calling.`);
    this.name = "ConversationProviderToolsUnsupportedError";
    this.provider = provider;
  }
}
