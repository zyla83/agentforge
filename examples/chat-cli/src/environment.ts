import process from "node:process";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1:8b";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful, clear, and concise local AI assistant.";
const DEFAULT_TIMEOUT_MS = 120_000;

export interface ChatEnvironment {
  readonly baseUrl: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly timeoutMs: number;
}

export function loadChatEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<ChatEnvironment> {
  const baseUrl = readString(environment, "OLLAMA_BASE_URL", DEFAULT_BASE_URL);
  const model = readString(environment, "OLLAMA_MODEL", DEFAULT_MODEL);
  const systemPrompt = readString(
    environment,
    "AGENTFORGE_SYSTEM_PROMPT",
    DEFAULT_SYSTEM_PROMPT,
  );
  const timeoutMs = readTimeout(environment);

  return Object.freeze({ baseUrl, model, systemPrompt, timeoutMs });
}

function readString(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const value = environment[name];
  if (value === undefined) return fallback;
  if (value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function readTimeout(environment: NodeJS.ProcessEnv): number {
  const value = environment.AGENTFORGE_REQUEST_TIMEOUT_MS;
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(value);
  if (
    !Number.isFinite(timeoutMs) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new Error(
      "AGENTFORGE_REQUEST_TIMEOUT_MS must be a positive finite integer.",
    );
  }
  return timeoutMs;
}
