export interface ChatSpeechOutputOptions {
  readonly signal?: AbortSignal;
}

export interface ChatSpeechOutput {
  speak(text: string, options?: ChatSpeechOutputOptions): Promise<void>;
}
