export interface WhisperClientOptions {
  readonly executable: string;
  readonly model: string;
  readonly language?: string;
}

export interface WhisperTranscriptionRequest {
  readonly inputFile: string;
  readonly outputPrefix: string;
}

export interface WhisperTranscriptionOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface WhisperTranscriptionResult {
  readonly status: "transcribed";
  readonly text: string;
}
