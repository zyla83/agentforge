import {
  ConversationError,
  InvalidConversationMessageError,
  createConversationMessage,
} from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const timestamp = "2026-07-15T12:00:00.000Z";

describe("createConversationMessage", () => {
  it("generates an ID and timestamp with injected deterministic factories", () => {
    const message = createConversationMessage(
      { role: LLMMessageRole.User, content: "Hello" },
      {
        idGenerator: () => "generated-message",
        now: () => new Date(timestamp),
      },
    );

    expect(message).toEqual({
      id: "generated-message",
      role: LLMMessageRole.User,
      content: "Hello",
      createdAt: timestamp,
    });
    expect(Object.isFrozen(message)).toBe(true);
  });

  it("preserves supplied IDs, timestamps, and content exactly", () => {
    const input = {
      id: " message-1 ",
      role: LLMMessageRole.Assistant,
      content: "  Hello\n world  ",
      createdAt: "2026-07-15T14:00:00+02:00",
    };
    const before = { ...input };

    const message = createConversationMessage(input);

    expect(message).toEqual(input);
    expect(input).toEqual(before);
    expect(message).not.toBe(input);
  });

  it.each(Object.values(LLMMessageRole))("supports the %s role", (role) => {
    expect(
      createConversationMessage({
        id: `message-${role}`,
        role,
        content: "Content",
        createdAt: timestamp,
      }).role,
    ).toBe(role);
  });

  it("uses the platform UUID generator and current clock by default", () => {
    const message = createConversationMessage({
      role: LLMMessageRole.System,
      content: "System prompt",
    });

    expect(message.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(message.createdAt)).not.toBeNaN();
  });

  it.each([undefined, null, [], "message", 42])(
    "rejects malformed input %# without leaking a native error",
    (input) => {
      expect(() => createConversationMessage(input as never)).toThrow(
        InvalidConversationMessageError,
      );
    },
  );

  it("reports malformed fields in deterministic order", () => {
    const error = captureMessageError(() =>
      createConversationMessage({
        id: " ",
        role: "tool" as LLMMessageRole,
        content: " ",
        createdAt: "not-a-date",
      }),
    );

    expect(error.details).toEqual([
      "id: must be a non-empty string",
      "role: unsupported role",
      "content: must be a non-empty string",
      "createdAt: must be a valid ISO 8601 timestamp",
    ]);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it.each(["2026-07-15", "2026-07-15T12:00:00", "not-a-date"])(
    "rejects timestamp %s without a timezone",
    (createdAt) => {
      expect(() =>
        createConversationMessage({
          id: "message",
          role: LLMMessageRole.User,
          content: "Hello",
          createdAt,
        }),
      ).toThrow(InvalidConversationMessageError);
    },
  );

  it.each(["", " ", 42, null])(
    "rejects malformed generated ID %#",
    (generated) => {
      expect(() =>
        createConversationMessage(
          { role: LLMMessageRole.User, content: "Hello", createdAt: timestamp },
          { idGenerator: () => generated as string },
        ),
      ).toThrowError(
        expect.objectContaining({
          details: ["idGenerator: must return a non-empty string"],
        }),
      );
    },
  );

  it.each([new Date(Number.NaN), "date", null])(
    "rejects malformed clock result %#",
    (date) => {
      expect(() =>
        createConversationMessage(
          { id: "message", role: LLMMessageRole.User, content: "Hello" },
          { now: () => date as Date },
        ),
      ).toThrowError(
        expect.objectContaining({ details: ["now: must return a valid Date"] }),
      );
    },
  );

  it("preserves a generator failure as the error cause", () => {
    const cause = new Error("generator failed");
    const error = captureMessageError(() =>
      createConversationMessage(
        { role: LLMMessageRole.User, content: "Hello", createdAt: timestamp },
        {
          idGenerator() {
            throw cause;
          },
        },
      ),
    );

    expect(error).toBeInstanceOf(ConversationError);
    expect(error.cause).toBe(cause);
  });
});

function captureMessageError(
  action: () => void,
): InvalidConversationMessageError {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidConversationMessageError) return error;
    throw error;
  }
  throw new Error("Expected InvalidConversationMessageError.");
}
