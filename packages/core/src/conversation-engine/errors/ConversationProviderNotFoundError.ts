import { ConversationEngineError } from "./ConversationEngineError.js";

export class ConversationProviderNotFoundError extends ConversationEngineError {
  readonly provider: string | undefined;

  constructor(provider?: string, options?: ErrorOptions) {
    super(
      provider === undefined
        ? "No default LLM provider is registered."
        : `LLM provider "${provider}" is not registered.`,
      options,
    );
    this.name = "ConversationProviderNotFoundError";
    this.provider = provider;
  }
}
