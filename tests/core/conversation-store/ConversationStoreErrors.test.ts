import {
  ConversationNotFoundError,
  ConversationStoreError,
  InvalidConversationError,
  InvalidConversationStoreInputError,
  createInMemoryConversationStore,
} from "@agentforge/core";
import { describe, expect, it } from "vitest";

describe("conversation store errors", () => {
  it("provides a stable base error", () => {
    const cause = new Error("cause");
    const error = new ConversationStoreError("Store failed.", { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ConversationStoreError");
    expect(error.message).toBe("Store failed.");
    expect(error.cause).toBe(cause);
  });

  it("copies and freezes invalid input details", () => {
    const details = ["limit must be a positive finite integer"];
    const error = new InvalidConversationStoreInputError(details);
    details.push("changed");

    expect(error).toBeInstanceOf(ConversationStoreError);
    expect(error.name).toBe("InvalidConversationStoreInputError");
    expect(error.message).toBe(
      "Conversation store input is invalid: limit must be a positive finite integer.",
    );
    expect(error.details).toEqual(["limit must be a positive finite integer"]);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it("exposes the exact missing conversation ID", () => {
    const error = new ConversationNotFoundError(" conversation ");

    expect(error).toBeInstanceOf(ConversationStoreError);
    expect(error.name).toBe("ConversationNotFoundError");
    expect(error.conversationId).toBe(" conversation ");
    expect(error.message).toBe('Conversation " conversation " was not found.');
  });

  it("wraps conversation validation errors as store errors", async () => {
    const store = createInMemoryConversationStore();

    await expect(
      store.save({ id: "", messages: [] } as never),
    ).rejects.toMatchObject({
      name: "InvalidConversationStoreInputError",
      cause: expect.any(InvalidConversationError),
    });
  });
});
