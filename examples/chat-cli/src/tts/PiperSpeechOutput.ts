import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { PiperClient } from "@agentforge/piper-client";
import type {
  ChatSpeechOutput,
  ChatSpeechOutputOptions,
} from "./ChatSpeechOutput.js";
import { WindowsWavPlayer } from "./WindowsWavPlayer.js";
import { ChatTtsCleanupError } from "./errors.js";

const TEMPORARY_DIRECTORY_PREFIX = "agentforge-piper-";
const TEMPORARY_WAV_NAME = "speech.wav";

export class PiperSpeechOutput implements ChatSpeechOutput {
  private readonly client: PiperClient;
  private readonly timeoutMs: number;

  constructor(client: PiperClient, timeoutMs: number) {
    this.client = client;
    this.timeoutMs = timeoutMs;
  }

  async speak(text: string, options?: ChatSpeechOutputOptions): Promise<void> {
    let temporaryDirectory: string | undefined;
    let primaryError: unknown;
    try {
      temporaryDirectory = await mkdtemp(
        join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
      );
      assertOwnedTemporaryDirectory(temporaryDirectory);
      const outputFile = join(temporaryDirectory, TEMPORARY_WAV_NAME);
      await this.client.synthesize(
        { text, outputFile },
        options?.signal === undefined
          ? { timeoutMs: this.timeoutMs }
          : { signal: options.signal, timeoutMs: this.timeoutMs },
      );
      const player = new WindowsWavPlayer(outputFile);
      await player.play(
        options?.signal === undefined
          ? { timeoutMs: this.timeoutMs }
          : { signal: options.signal, timeoutMs: this.timeoutMs },
      );
    } catch (error) {
      primaryError = error;
    }

    let cleanupError: ChatTtsCleanupError | undefined;
    if (temporaryDirectory !== undefined) {
      try {
        assertOwnedTemporaryDirectory(temporaryDirectory);
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch (error) {
        cleanupError = new ChatTtsCleanupError({ cause: error });
      }
    }

    if (primaryError !== undefined && cleanupError !== undefined) {
      throw new AggregateError(
        [primaryError, cleanupError],
        "Speech output failed and temporary audio cleanup also failed.",
      );
    }
    if (primaryError !== undefined) throw primaryError;
    if (cleanupError !== undefined) throw cleanupError;
  }
}

function assertOwnedTemporaryDirectory(directory: string): void {
  const temporaryRoot = resolve(tmpdir());
  const resolvedDirectory = resolve(directory);
  if (
    dirname(resolvedDirectory) !== temporaryRoot ||
    !resolvedDirectory.startsWith(`${temporaryRoot}${sep}`) ||
    !resolvedDirectory
      .slice(temporaryRoot.length + 1)
      .startsWith(TEMPORARY_DIRECTORY_PREFIX)
  ) {
    throw new ChatTtsCleanupError();
  }
}
