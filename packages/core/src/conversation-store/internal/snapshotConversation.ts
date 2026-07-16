import type { Conversation } from "../../conversation/index.js";
import { InvalidConversationError } from "../../conversation/index.js";
import { validateConversation } from "../../conversation/internal/validateConversation.js";
import { InvalidConversationStoreInputError } from "../errors/index.js";

export function snapshotConversation(
  conversation: Conversation,
): Readonly<Conversation> {
  try {
    validateConversation(conversation);
  } catch (error) {
    if (error instanceof InvalidConversationError) {
      throw new InvalidConversationStoreInputError(
        ["conversation must be valid"],
        { cause: error },
      );
    }
    throw new InvalidConversationStoreInputError(
      ["conversation could not be validated"],
      { cause: error },
    );
  }

  try {
    return deepFrozenCopy(
      conversation,
      new WeakSet(),
    ) as Readonly<Conversation>;
  } catch (error) {
    if (error instanceof InvalidConversationStoreInputError) throw error;
    throw new InvalidConversationStoreInputError(
      ["conversation could not be snapshotted"],
      { cause: error },
    );
  }
}

function deepFrozenCopy(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) {
    throw new InvalidConversationStoreInputError([
      "conversation must not contain cyclic values",
    ]);
  }

  ancestors.add(value);
  let copy: unknown;
  if (Array.isArray(value)) {
    copy = Object.freeze(value.map((item) => deepFrozenCopy(item, ancestors)));
  } else {
    copy = Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          deepFrozenCopy(item, ancestors),
        ]),
      ),
    );
  }
  ancestors.delete(value);
  return copy;
}
