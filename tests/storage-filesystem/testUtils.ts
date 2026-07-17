import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Conversation } from "@agentforge/core";
import { LLMMessageRole } from "@agentforge/provider-sdk";

export const createdAt = "2026-07-17T10:00:00.000Z";

export async function createTemporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agentforge-storage-filesystem-"));
}

export async function removeTemporaryRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export function conversation(
  id: string,
  updatedAt = createdAt,
  content = `Message for ${id}`,
): Conversation {
  return {
    id,
    createdAt,
    updatedAt,
    messages: [
      {
        id: `${id}-message`,
        role: LLMMessageRole.User,
        content,
        createdAt: updatedAt,
      },
    ],
  };
}

export function conversationsPath(root: string): string {
  return join(root, "conversations");
}

export function conversationFilePath(root: string, id: string): string {
  return join(
    conversationsPath(root),
    `${Buffer.from(id, "utf8").toString("base64url")}.json`,
  );
}
