import {
  OllamaAbortError,
  OllamaConnectionError,
  OllamaHttpError,
  OllamaRequestError,
  OllamaResponseError,
  OllamaTimeoutError,
} from "@agentforge/ollama-client";
import {
  ProviderAbortError,
  ProviderRequestError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@agentforge/provider-sdk";
import type { ProviderError } from "@agentforge/provider-sdk";

const MAX_SERVER_MESSAGE_LENGTH = 500;

export function mapOllamaClientError(
  providerName: string,
  error: unknown,
): ProviderError {
  if (error instanceof OllamaAbortError) {
    return new ProviderAbortError(providerName, { cause: error });
  }
  if (error instanceof OllamaTimeoutError) {
    return new ProviderTimeoutError(providerName, error.timeoutMs, {
      cause: error,
    });
  }
  if (error instanceof OllamaConnectionError) {
    return new ProviderUnavailableError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" cannot connect to Ollama.`,
      { cause: error },
    );
  }
  if (error instanceof OllamaHttpError) {
    return mapHttpError(providerName, error);
  }
  if (error instanceof OllamaRequestError) {
    return new ProviderRequestError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" produced an invalid Ollama request.`,
      { cause: error },
    );
  }
  if (error instanceof OllamaResponseError) {
    return new ProviderResponseError(
      providerName,
      `Provider "${resolveProviderName(providerName)}" received an invalid response from Ollama.`,
      { cause: error },
    );
  }
  return new ProviderRequestError(
    providerName,
    `Provider "${resolveProviderName(providerName)}" request failed unexpectedly.`,
    { cause: error },
  );
}

function mapHttpError(
  providerName: string,
  error: OllamaHttpError,
): ProviderRequestError {
  const resolvedName = resolveProviderName(providerName);
  if (error.status === 404 || indicatesMissingModel(error.serverMessage)) {
    const safeMessage = getSafeServerMessage(error.serverMessage);
    const suffix = safeMessage === undefined ? "." : `: ${safeMessage}.`;
    return new ProviderRequestError(
      providerName,
      `Provider "${resolvedName}" could not use the requested model${suffix}`,
      { cause: error },
    );
  }
  return new ProviderRequestError(
    providerName,
    `Provider "${resolvedName}" request failed with HTTP ${error.status}.`,
    { cause: error },
  );
}

function indicatesMissingModel(message: string | undefined): boolean {
  if (message === undefined) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("model") &&
    (normalized.includes("not found") ||
      normalized.includes("does not exist") ||
      normalized.includes("missing"))
  );
}

function getSafeServerMessage(message: string | undefined): string | undefined {
  return message !== undefined && message.length <= MAX_SERVER_MESSAGE_LENGTH
    ? message
    : undefined;
}

function resolveProviderName(name: string): string {
  return typeof name === "string" && name.trim().length > 0
    ? name
    : "<unknown>";
}
