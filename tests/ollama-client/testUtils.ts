import type { FetchImplementation } from "@agentforge/ollama-client";
import { vi } from "vitest";

export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

export function createFetch(value: unknown = { version: "0.12.6" }) {
  return vi.fn(async () =>
    jsonResponse(value),
  ) as unknown as FetchImplementation & {
    mock: { calls: [string | URL | Request, RequestInit | undefined][] };
  };
}

export const validChatResponse = {
  model: "gemma3",
  message: { role: "assistant", content: "Hello!" },
  done: true,
};
