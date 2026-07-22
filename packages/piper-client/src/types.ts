export interface PiperClientOptions {
  readonly executable: string;
  readonly model: string;
  readonly config?: string;
}

export interface PiperSynthesisRequest {
  readonly text: string;
  readonly outputFile: string;
}

export interface PiperSynthesisOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface PiperSynthesisResult {
  readonly status: "created";
  readonly outputFile: string;
}
