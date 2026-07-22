import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      toolMode: "off",
      tts: { mode: "off" },
    });
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.tts)).toBe(true);
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
      toolMode: "off",
      tts: { mode: "off" },
    });
    expect(input).toEqual(before);
  });

  it.each([
    [undefined, "off"],
    ["off", "off"],
    ["OFF", "off"],
    ["example", "example"],
    ["  ExAmPlE\t", "example"],
    ["spotify", "spotify"],
    ["  SpOtIfY\t", "spotify"],
  ] as const)("parses tool mode %j as %s", (value, expected) => {
    const spotify =
      expected === "spotify" ? { SPOTIFY_CLIENT_ID: "client-id" } : {};
    const environment = loadChatEnvironment(
      value === undefined ? {} : { AGENTFORGE_CHAT_TOOLS: value, ...spotify },
      "/workspace",
    );
    expect(environment.toolMode).toBe(expected);
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it.each(["", " ", "true", "1", "yes", "all", "examples"])(
    "rejects unsupported tool mode %j",
    (value) => {
      expect(() =>
        loadChatEnvironment({ AGENTFORGE_CHAT_TOOLS: value }),
      ).toThrow(
        'AGENTFORGE_CHAT_TOOLS must be "off", "example", or "spotify".',
      );
    },
  );

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

  it("ignores Spotify variables outside Spotify mode", () => {
    expect(
      loadChatEnvironment({
        SPOTIFY_CLIENT_ID: "",
        SPOTIFY_REDIRECT_URI: "unsafe",
        AGENTFORGE_SPOTIFY_DATA_DIR: "",
      }),
    ).not.toHaveProperty("spotify");
  });

  it.each([undefined, "off", "OFF", "  OfF\t"])(
    "keeps TTS disabled for mode %j and ignores Piper variables",
    (value) => {
      const environment = loadChatEnvironment(
        {
          ...(value === undefined ? {} : { AGENTFORGE_CHAT_TTS: value }),
          AGENTFORGE_PIPER_EXECUTABLE: "",
          AGENTFORGE_PIPER_MODEL: "relative.onnx",
          AGENTFORGE_PIPER_CONFIG: "invalid",
        },
        "/workspace",
      );
      expect(environment.tts).toEqual({ mode: "off" });
      expect(Object.isFrozen(environment.tts)).toBe(true);
    },
  );

  it.each(["", " ", "true", "1", "voice", "cloud"])(
    "rejects unsupported TTS mode %j",
    (value) => {
      expect(() => loadChatEnvironment({ AGENTFORGE_CHAT_TTS: value })).toThrow(
        'AGENTFORGE_CHAT_TTS must be "off" or "piper".',
      );
    },
  );

  it("rejects Piper mode on non-Windows platforms before path checks", () => {
    expect(() =>
      loadChatEnvironment(
        { AGENTFORGE_CHAT_TTS: "piper" },
        "/workspace",
        "linux",
      ),
    ).toThrow("supported only on Windows");
  });

  it("requires exact explicit Piper files and freezes the configuration", () => {
    const fixture = createPiperFixture();
    try {
      const environment = loadChatEnvironment(
        {
          AGENTFORGE_CHAT_TTS: "  PiPeR ",
          AGENTFORGE_PIPER_EXECUTABLE: fixture.executable,
          AGENTFORGE_PIPER_MODEL: fixture.model,
          AGENTFORGE_PIPER_CONFIG: fixture.config,
        },
        "/workspace",
        "win32",
      );
      expect(environment.tts).toEqual({
        mode: "piper",
        piper: {
          executable: fixture.executable,
          model: fixture.model,
          config: fixture.config,
        },
      });
      expect(Object.isFrozen(environment.tts)).toBe(true);
      expect(Object.isFrozen(environment.tts.piper)).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("allows Piper to use an adjacent config when no explicit config is set", () => {
    const fixture = createPiperFixture();
    try {
      expect(
        loadChatEnvironment(
          {
            AGENTFORGE_CHAT_TTS: "piper",
            AGENTFORGE_PIPER_EXECUTABLE: fixture.executable,
            AGENTFORGE_PIPER_MODEL: fixture.model,
          },
          "/workspace",
          "win32",
        ).tts,
      ).toEqual({
        mode: "piper",
        piper: { executable: fixture.executable, model: fixture.model },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("configures Spotify tools and Piper speech independently", () => {
    const fixture = createPiperFixture();
    try {
      const environment = loadChatEnvironment(
        {
          AGENTFORGE_CHAT_TOOLS: "spotify",
          SPOTIFY_CLIENT_ID: "client-id",
          AGENTFORGE_CHAT_TTS: "piper",
          AGENTFORGE_PIPER_EXECUTABLE: fixture.executable,
          AGENTFORGE_PIPER_MODEL: fixture.model,
        },
        "/workspace",
        "win32",
      );
      expect(environment.toolMode).toBe("spotify");
      expect(environment.spotify?.clientId).toBe("client-id");
      expect(environment.tts).toEqual({
        mode: "piper",
        piper: { executable: fixture.executable, model: fixture.model },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects missing, relative, controlled, wrong-extension, and non-file Piper paths", () => {
    const fixture = createPiperFixture();
    try {
      for (const [name, value] of [
        ["AGENTFORGE_PIPER_EXECUTABLE", undefined],
        ["AGENTFORGE_PIPER_EXECUTABLE", "relative.exe"],
        ["AGENTFORGE_PIPER_EXECUTABLE", `${fixture.executable}\0`],
        ["AGENTFORGE_PIPER_MODEL", join(fixture.directory, "voice.txt")],
        ["AGENTFORGE_PIPER_CONFIG", join(fixture.directory, "voice.json")],
        ["AGENTFORGE_PIPER_CONFIG", fixture.directory],
      ] as const) {
        const input: NodeJS.ProcessEnv = {
          AGENTFORGE_CHAT_TTS: "piper",
          AGENTFORGE_PIPER_EXECUTABLE: fixture.executable,
          AGENTFORGE_PIPER_MODEL: fixture.model,
          AGENTFORGE_PIPER_CONFIG: fixture.config,
        };
        if (value === undefined) delete input[name];
        else input[name] = value;
        expect(() => loadChatEnvironment(input, "/workspace", "win32")).toThrow(
          name,
        );
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("requires Spotify client ID only in Spotify mode and freezes its defaults", () => {
    expect(() =>
      loadChatEnvironment({ AGENTFORGE_CHAT_TOOLS: "spotify" }),
    ).toThrow("SPOTIFY_CLIENT_ID");
    const environment = loadChatEnvironment({
      AGENTFORGE_CHAT_TOOLS: "spotify",
      SPOTIFY_CLIENT_ID: "client-id",
    });
    expect(environment.spotify).toEqual({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1:43821/callback",
      dataDirectory: expect.stringMatching(
        new RegExp(`${escapeRegExp(homedir())}.*\\.agentforge.*spotify`, "u"),
      ),
    });
    expect(Object.isFrozen(environment.spotify)).toBe(true);
  });

  it("accepts safe Spotify overrides and rejects unsafe values", () => {
    const environment = loadChatEnvironment(
      {
        AGENTFORGE_CHAT_TOOLS: "spotify",
        SPOTIFY_CLIENT_ID: "client-id",
        SPOTIFY_REDIRECT_URI: "http://127.0.0.1:50000/spotify-callback",
        AGENTFORGE_SPOTIFY_DATA_DIR: " ./spotify-data ",
      },
      "/workspace",
    );
    expect(environment.spotify?.redirectUri).toBe(
      "http://127.0.0.1:50000/spotify-callback",
    );
    expect(environment.spotify?.dataDirectory).toMatch(/spotify-data$/u);
    for (const redirectUri of [
      "https://127.0.0.1:43821/callback",
      "http://localhost:43821/callback",
      "http://0.0.0.0:43821/callback",
      "http://127.0.0.1:43821/callback?query=1",
    ]) {
      expect(() =>
        loadChatEnvironment({
          AGENTFORGE_CHAT_TOOLS: "spotify",
          SPOTIFY_CLIENT_ID: "client-id",
          SPOTIFY_REDIRECT_URI: redirectUri,
        }),
      ).toThrow("SPOTIFY_REDIRECT_URI");
    }
    expect(() =>
      loadChatEnvironment({
        AGENTFORGE_CHAT_TOOLS: "spotify",
        SPOTIFY_CLIENT_ID: "client-id",
        AGENTFORGE_SPOTIFY_DATA_DIR: " ",
      }),
    ).toThrow("AGENTFORGE_SPOTIFY_DATA_DIR");
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function createPiperFixture(): {
  readonly directory: string;
  readonly executable: string;
  readonly model: string;
  readonly config: string;
  readonly cleanup: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "agentforge-piper-env-"));
  const executable = join(directory, "piper executable.exe");
  const model = join(directory, "voice model.onnx");
  const config = join(directory, "voice model.onnx.json");
  writeFileSync(executable, "executable");
  writeFileSync(model, "model");
  writeFileSync(config, "{}");
  return {
    directory,
    executable,
    model,
    config,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
