import type { ConversationTurnController } from "./ConversationTurnController.js";

export function createConversationTurnController(): ConversationTurnController {
  const controller = new AbortController();

  return Object.freeze({
    get signal() {
      return controller.signal;
    },
    get aborted() {
      return controller.signal.aborted;
    },
    get reason() {
      return controller.signal.reason;
    },
    abort(reason?: unknown) {
      controller.abort(reason);
    },
  });
}
