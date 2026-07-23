import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { WhisperClient } from "@agentforge/whisper-client";
import type {
  ChatSpeechInput,
  ChatSpeechInputOptions,
  ChatSpeechInputResult,
} from "./ChatSpeechInput.js";
import type { WindowsMicrophoneRecorder } from "./WindowsMicrophoneRecorder.js";
import { ChatSttCleanupError } from "./errors.js";

const TEMPORARY_DIRECTORY_PREFIX = "agentforge-whisper-";
const TEMPORARY_WAV_NAME = "recording.wav";
const TRANSCRIPT_PREFIX_NAME = "transcript";

export class WhisperSpeechInput implements ChatSpeechInput {
  private readonly recorder: WindowsMicrophoneRecorder;
  private readonly client: WhisperClient;
  private readonly timeoutMs: number;
  private readonly removeTemporaryDirectory: (
    directory: string,
  ) => Promise<void>;

  constructor(
    recorder: WindowsMicrophoneRecorder,
    client: WhisperClient,
    timeoutMs: number,
    removeTemporaryDirectory: (directory: string) => Promise<void> = async (
      directory,
    ) => rm(directory, { recursive: true, force: true }),
  ) {
    this.recorder = recorder;
    this.client = client;
    this.timeoutMs = timeoutMs;
    this.removeTemporaryDirectory = removeTemporaryDirectory;
  }

  async transcribe(
    durationSeconds: number,
    options?: ChatSpeechInputOptions,
  ): Promise<Readonly<ChatSpeechInputResult>> {
    let temporaryDirectory: string | undefined;
    let result: Readonly<ChatSpeechInputResult> | undefined;
    let primaryError: unknown;
    try {
      temporaryDirectory = await mkdtemp(
        join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
      );
      assertOwnedTemporaryDirectory(temporaryDirectory);
      const recordingFile = join(temporaryDirectory, TEMPORARY_WAV_NAME);
      const outputPrefix = join(temporaryDirectory, TRANSCRIPT_PREFIX_NAME);
      options?.onPhase?.("recording");
      await this.recorder.record(
        { outputFile: recordingFile, durationSeconds },
        options?.signal === undefined
          ? { timeoutMs: this.timeoutMs }
          : { signal: options.signal, timeoutMs: this.timeoutMs },
      );
      options?.onPhase?.("transcription");
      const transcription = await this.client.transcribe(
        { inputFile: recordingFile, outputPrefix },
        options?.signal === undefined
          ? { timeoutMs: this.timeoutMs }
          : { signal: options.signal, timeoutMs: this.timeoutMs },
      );
      result = Object.freeze({ text: transcription.text });
    } catch (error) {
      primaryError = error;
    }

    let cleanupError: ChatSttCleanupError | undefined;
    if (temporaryDirectory !== undefined) {
      try {
        assertOwnedTemporaryDirectory(temporaryDirectory);
        await this.removeTemporaryDirectory(temporaryDirectory);
      } catch (error) {
        cleanupError = new ChatSttCleanupError({ cause: error });
      }
    }
    if (primaryError !== undefined && cleanupError !== undefined) {
      throw new AggregateError(
        [primaryError, cleanupError],
        "Speech input failed and temporary artifact cleanup also failed.",
      );
    }
    if (primaryError !== undefined) throw primaryError;
    if (cleanupError !== undefined) throw cleanupError;
    if (result === undefined) throw new ChatSttCleanupError();
    return result;
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
    throw new ChatSttCleanupError();
  }
}
