export interface OllamaModelDetails {
  readonly format?: string;
  readonly family?: string;
  readonly families?: readonly string[];
  readonly parameterSize?: string;
  readonly quantizationLevel?: string;
}

export interface OllamaModel {
  readonly name: string;
  readonly model: string;
  readonly modifiedAt?: string;
  readonly size?: number;
  readonly digest?: string;
  readonly details?: Readonly<OllamaModelDetails>;
}
