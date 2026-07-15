export interface LLMGenerationOptions {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
}
