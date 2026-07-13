export interface Plugin {
  readonly name: string;
  initialize(): Promise<void>;
}
