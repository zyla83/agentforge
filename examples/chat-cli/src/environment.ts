import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import {
  DEFAULT_SPOTIFY_REDIRECT_URI,
  validateSpotifyRedirectUri,
} from "@agentforge/spotify-client";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1:8b";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful, clear, and concise local AI assistant.";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_DATA_DIRECTORY = ".agentforge/chat";

export type ChatToolMode = "off" | "example" | "spotify";
export type ChatTtsMode = "off" | "piper";

export interface ChatPiperEnvironment {
  readonly executable: string;
  readonly model: string;
  readonly config?: string;
}

export interface ChatTtsEnvironment {
  readonly mode: ChatTtsMode;
  readonly piper?: Readonly<ChatPiperEnvironment>;
}

export interface ChatSpotifyEnvironment {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly dataDirectory: string;
}

export interface ChatEnvironment {
  readonly baseUrl: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly timeoutMs: number;
  readonly dataDirectory: string;
  readonly toolMode: ChatToolMode;
  readonly tts: Readonly<ChatTtsEnvironment>;
  readonly spotify?: Readonly<ChatSpotifyEnvironment>;
}

export function loadChatEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  currentWorkingDirectory: string = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): Readonly<ChatEnvironment> {
  const baseUrl = readString(environment, "OLLAMA_BASE_URL", DEFAULT_BASE_URL);
  const model = readString(environment, "OLLAMA_MODEL", DEFAULT_MODEL);
  const systemPrompt = readString(
    environment,
    "AGENTFORGE_SYSTEM_PROMPT",
    DEFAULT_SYSTEM_PROMPT,
  );
  const timeoutMs = readTimeout(environment);
  const dataDirectory = resolve(
    currentWorkingDirectory,
    readDataDirectory(environment),
  );
  const toolMode = readToolMode(environment);
  const tts = readTtsEnvironment(environment, platform);
  const spotify =
    toolMode === "spotify" ? readSpotifyEnvironment(environment) : undefined;

  return Object.freeze({
    baseUrl,
    model,
    systemPrompt,
    timeoutMs,
    dataDirectory,
    toolMode,
    tts,
    ...(spotify === undefined ? {} : { spotify }),
  });
}

function readTtsEnvironment(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Readonly<ChatTtsEnvironment> {
  const configuredMode = environment.AGENTFORGE_CHAT_TTS;
  const mode =
    configuredMode === undefined ? "off" : configuredMode.trim().toLowerCase();
  if (mode !== "off" && mode !== "piper") {
    throw new Error('AGENTFORGE_CHAT_TTS must be "off" or "piper".');
  }
  if (mode === "off") return Object.freeze({ mode });
  if (platform !== "win32") {
    throw new Error("Piper speech output is supported only on Windows.");
  }

  const executable = readPiperPath(
    environment.AGENTFORGE_PIPER_EXECUTABLE,
    "AGENTFORGE_PIPER_EXECUTABLE",
  );
  const model = readPiperPath(
    environment.AGENTFORGE_PIPER_MODEL,
    "AGENTFORGE_PIPER_MODEL",
    ".onnx",
  );
  const configuredConfig = environment.AGENTFORGE_PIPER_CONFIG;
  const config =
    configuredConfig === undefined
      ? undefined
      : readPiperPath(
          configuredConfig,
          "AGENTFORGE_PIPER_CONFIG",
          ".onnx.json",
        );
  const piper = Object.freeze(
    config === undefined
      ? { executable, model }
      : { executable, model, config },
  );
  return Object.freeze({ mode, piper });
}

function readPiperPath(
  value: string | undefined,
  name: string,
  suffix?: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} must be an explicit absolute file path.`);
  }
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an explicit absolute file path.`);
  }
  if (containsControlCharacters(value)) {
    throw new Error(`${name} must not contain control characters.`);
  }
  if (suffix !== undefined && !value.toLowerCase().endsWith(suffix)) {
    throw new Error(`${name} must end in ${suffix}.`);
  }
  try {
    if (!lstatSync(value).isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`${name} must reference an existing regular file.`);
  }
  return value;
}

function readToolMode(environment: NodeJS.ProcessEnv): ChatToolMode {
  const value = environment.AGENTFORGE_CHAT_TOOLS;
  if (value === undefined) return "off";
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "example" ||
    normalized === "spotify"
  ) {
    return normalized;
  }
  throw new Error(
    'AGENTFORGE_CHAT_TOOLS must be "off", "example", or "spotify".',
  );
}

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function readSpotifyEnvironment(
  environment: NodeJS.ProcessEnv,
): Readonly<ChatSpotifyEnvironment> {
  const clientId = environment.SPOTIFY_CLIENT_ID;
  if (clientId === undefined || clientId.trim().length === 0) {
    throw new Error(
      "SPOTIFY_CLIENT_ID must be a non-empty string in Spotify tool mode.",
    );
  }
  const redirectUri =
    environment.SPOTIFY_REDIRECT_URI ?? DEFAULT_SPOTIFY_REDIRECT_URI;
  try {
    validateSpotifyRedirectUri(redirectUri);
  } catch {
    throw new Error(
      "SPOTIFY_REDIRECT_URI must use http://127.0.0.1:<port>/<path> without credentials, query, or fragment.",
    );
  }
  const configuredDirectory = environment.AGENTFORGE_SPOTIFY_DATA_DIR;
  if (
    configuredDirectory !== undefined &&
    configuredDirectory.trim().length === 0
  ) {
    throw new Error("AGENTFORGE_SPOTIFY_DATA_DIR must be a non-empty path.");
  }
  return Object.freeze({
    clientId,
    redirectUri,
    dataDirectory: resolve(
      configuredDirectory?.trim() ??
        resolve(homedir(), ".agentforge", "spotify"),
    ),
  });
}

function readDataDirectory(environment: NodeJS.ProcessEnv): string {
  const value = environment.AGENTFORGE_CHAT_DATA_DIR;
  if (value === undefined) return DEFAULT_DATA_DIRECTORY;
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("AGENTFORGE_CHAT_DATA_DIR must be a non-empty string.");
  }
  return trimmed;
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
