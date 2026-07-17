import { describe, expect, it } from "vitest";
import { loadChatEnvironment } from "../../../examples/chat-cli/src/environment.js";

describe("loadChatEnvironment", () => {
  it("uses all defaults and freezes the result", () => {
    const environment = loadChatEnvironment({}, "/workspace");

    expect(environment).toEqual({
      baseUrl: "http://localhost:11434",
      model: "llama3.1:8b",
      systemPrompt: "You are a helpful, clear, and concise local AI assistant.",
      timeoutMs: 120_000,
      dataDirectory: expect.stringMatching(
        /[\\/]workspace[\\/]\.agentforge[\\/]chat$/u,
      ),
    });
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it("preserves every supplied override exactly without mutating input", () => {
    const input = {
      OLLAMA_BASE_URL: " http://127.0.0.1:11435 ",
      OLLAMA_MODEL: " qwen2.5:7b ",
      AGENTFORGE_SYSTEM_PROMPT: "  Answer clearly.\n  ",
      AGENTFORGE_REQUEST_TIMEOUT_MS: "45000",
      AGENTFORGE_CHAT_DATA_DIR: " ./custom data ",
    };
    const before = { ...input };

    expect(loadChatEnvironment(input, "/workspace")).toEqual({
      baseUrl: " http://127.0.0.1:11435 ",
      model: " qwen2.5:7b ",
      systemPrompt: "  Answer clearly.\n  ",
      timeoutMs: 45_000,
      dataDirectory: expect.stringMatching(/[\\/]workspace[\\/]custom data$/u),
    });
    expect(input).toEqual(before);
  });

  it.each([
    [{ OLLAMA_BASE_URL: " " }, "OLLAMA_BASE_URL"],
    [{ OLLAMA_MODEL: "" }, "OLLAMA_MODEL"],
    [{ AGENTFORGE_SYSTEM_PROMPT: "\t" }, "AGENTFORGE_SYSTEM_PROMPT"],
    [{ AGENTFORGE_CHAT_DATA_DIR: "  " }, "AGENTFORGE_CHAT_DATA_DIR"],
  ])("rejects malformed string configuration %#", (input, name) => {
    expect(() => loadChatEnvironment(input)).toThrow(name);
  });

  it.each(["", "invalid", "0", "-1", "1.5", "Infinity", "NaN"])(
    "rejects malformed timeout %j",
    (timeout) => {
      expect(() =>
        loadChatEnvironment({ AGENTFORGE_REQUEST_TIMEOUT_MS: timeout }),
      ).toThrow(
        "AGENTFORGE_REQUEST_TIMEOUT_MS must be a positive finite integer.",
      );
    },
  );

  it("resolves an absolute data directory without accessing it", () => {
    const dataDirectory =
      process.platform === "win32" ? "C:\\chat-data" : "/chat-data";
    expect(
      loadChatEnvironment(
        { AGENTFORGE_CHAT_DATA_DIR: dataDirectory },
        "/ignored",
      ).dataDirectory,
    ).toBe(dataDirectory);
  });
});
