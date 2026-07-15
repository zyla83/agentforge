export class ProviderError extends Error {
  readonly providerName: string;

  constructor(message: string, providerName: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderError";
    this.providerName = resolveProviderName(providerName);
  }
}

export function resolveProviderName(providerName: string): string {
  if (typeof providerName !== "string" || providerName.trim().length === 0) {
    return "<unknown>";
  }

  return providerName;
}
