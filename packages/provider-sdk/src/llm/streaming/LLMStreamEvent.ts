import type { LLMGenerationResponse } from "../LLMGenerationResponse.js";

export interface LLMStreamDeltaEvent {
  readonly type: "delta";
  readonly model: string;
  readonly delta: string;
}

export interface LLMStreamCompletedEvent {
  readonly type: "completed";
  readonly response: Readonly<LLMGenerationResponse>;
}

export type LLMStreamEvent = LLMStreamDeltaEvent | LLMStreamCompletedEvent;
