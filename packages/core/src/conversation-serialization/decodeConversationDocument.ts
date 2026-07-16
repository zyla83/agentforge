import type { Conversation } from "../conversation/index.js";
import { snapshotDecodedConversation } from "./internal/snapshotDecodedConversation.js";
import { validateConversationDocument } from "./internal/validateConversationDocument.js";

export function decodeConversationDocument(
  value: unknown,
): Readonly<Conversation> {
  const document = validateConversationDocument(value);
  return snapshotDecodedConversation(document.conversation);
}
