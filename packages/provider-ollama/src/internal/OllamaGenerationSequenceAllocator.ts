import { ProviderRequestError } from "@agentforge/provider-sdk";

export class OllamaGenerationSequenceAllocator {
  private exhausted = false;

  constructor(
    private readonly providerName: string,
    private nextSequence = 1,
  ) {
    if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) {
      throw new ProviderRequestError(
        providerName,
        `Provider "${resolveProviderName(providerName)}" generation sequence is invalid.`,
      );
    }
  }

  allocate(): number {
    if (this.exhausted) {
      throw new ProviderRequestError(
        this.providerName,
        `Provider "${resolveProviderName(this.providerName)}" generation sequence is exhausted.`,
      );
    }
    const sequence = this.nextSequence;
    if (sequence === Number.MAX_SAFE_INTEGER) {
      this.exhausted = true;
    } else {
      this.nextSequence += 1;
    }
    return sequence;
  }
}

function resolveProviderName(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "<unknown>";
}
