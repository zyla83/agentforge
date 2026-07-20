import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilesystemSpotifyCredentialStore,
  SpotifyCredentialStoreCorruptionError,
  SpotifyCredentialStoreInitializationError,
  SpotifyCredentialStoreIoError,
} from "@agentforge/spotify-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];
const credential = {
  version: 1 as const,
  refreshToken: "sensitive-refresh-value",
  scopes: ["user-read-playback-state"],
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FilesystemSpotifyCredentialStore", () => {
  it("returns undefined for a missing file", async () => {
    const store = new FilesystemSpotifyCredentialStore({
      directory: await temporaryDirectory(),
    });
    await expect(store.load()).resolves.toBeUndefined();
  });

  it("atomically saves and deeply freezes a strict versioned document", async () => {
    const directory = await temporaryDirectory();
    const store = new FilesystemSpotifyCredentialStore({
      directory,
      createTemporaryId: () => "fixed",
    });
    await store.save(credential);

    const loaded = await store.load();
    expect(loaded).toEqual(credential);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded?.scopes)).toBe(true);
    expect(await readdir(directory)).toEqual([
      "spotify-refresh-credential.json",
    ]);
    const persisted = JSON.parse(await readFile(store.filePath, "utf8"));
    expect(Object.keys(persisted).sort()).toEqual([
      "refreshToken",
      "scopes",
      "version",
    ]);
    expect(JSON.stringify(persisted)).not.toContain("accessToken");
  });

  it("replaces a rotated refresh credential", async () => {
    const store = new FilesystemSpotifyCredentialStore({
      directory: await temporaryDirectory(),
    });
    await store.save(credential);
    await store.save({ ...credential, refreshToken: "rotated-value" });
    await expect(store.load()).resolves.toMatchObject({
      refreshToken: "rotated-value",
    });
  });

  it.each([
    ["not-json", "document: must be valid JSON"],
    [
      JSON.stringify({
        version: 2,
        refreshToken: "x",
        scopes: ["user-read-playback-state"],
      }),
      "document.version",
    ],
    [
      JSON.stringify({
        version: 1,
        refreshToken: "",
        scopes: ["user-read-playback-state"],
      }),
      "document.refreshToken",
    ],
    [
      JSON.stringify({
        version: 1,
        refreshToken: "x",
        scopes: ["user-read-playback-state"],
        extra: true,
      }),
      "document.extra",
    ],
    [
      JSON.stringify({
        version: 1,
        refreshToken: "x",
        scopes: ["playlist-read-private"],
      }),
      "document.scopes",
    ],
  ])(
    "rejects malformed persisted documents without exposing values",
    async (contents, detail) => {
      const directory = await temporaryDirectory();
      const store = new FilesystemSpotifyCredentialStore({ directory });
      await writeFile(store.filePath, contents, "utf8");
      const error = await store.load().catch((value) => value);
      expect(error).toBeInstanceOf(SpotifyCredentialStoreCorruptionError);
      expect(error.details.join(" ")).toContain(detail);
      expect(error.message).not.toContain("sensitive-refresh-value");
    },
  );

  it("classifies initialization and I/O failures and removes temporary files", async () => {
    const directory = await temporaryDirectory();
    const base = new FilesystemSpotifyCredentialStore({ directory });
    const operations = {
      mkdir: vi.fn(async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }),
      open: vi.fn(),
      readFile: vi.fn(),
      rename: vi.fn(),
      unlink: vi.fn(),
    } as never;
    await expect(
      new FilesystemSpotifyCredentialStore({
        directory,
        fileOperations: operations,
      }).save(credential),
    ).rejects.toBeInstanceOf(SpotifyCredentialStoreInitializationError);

    const fs = await import("node:fs/promises");
    const failingRename = {
      mkdir: fs.mkdir,
      open: fs.open,
      readFile: fs.readFile,
      rename: vi.fn(async () => {
        throw new Error("rename failed");
      }) as typeof fs.rename,
      unlink: fs.unlink,
    };
    await expect(
      new FilesystemSpotifyCredentialStore({
        directory,
        fileOperations: failingRename,
        createTemporaryId: () => "failure",
      }).save(credential),
    ).rejects.toBeInstanceOf(SpotifyCredentialStoreIoError);
    expect(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    expect(base.filePath).toContain("spotify-refresh-credential.json");
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agentforge-spotify-"));
  directories.push(directory);
  return directory;
}
