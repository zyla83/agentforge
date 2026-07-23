export type ChatSpeechInputPhase = "recording" | "transcription";

export interface ChatSpeechInputOptions {
  readonly signal?: AbortSignal;
  readonly onPhase?: (phase: ChatSpeechInputPhase) => void;
}

export interface ChatSpeechInputResult {
  readonly text: string;
}

export interface ChatSpeechInput {
  transcribe(
    durationSeconds: number,
    options?: ChatSpeechInputOptions,
  ): Promise<Readonly<ChatSpeechInputResult>>;
}
