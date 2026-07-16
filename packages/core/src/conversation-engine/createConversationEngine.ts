import { ConversationEngine } from "./ConversationEngine.js";
import type { ConversationEngineOptions } from "./ConversationEngineOptions.js";

export function createConversationEngine(
  options: ConversationEngineOptions,
): ConversationEngine {
  return new ConversationEngine(options);
}
