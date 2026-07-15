import {
  ProviderAbortError,
  ProviderError,
  ProviderRequestError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe("provider errors", () => {
  it("exposes the base provider error contract", () => {
    const error = new ProviderError("Provider failed.", "example");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ProviderError");
    expect(error.message).toBe("Provider failed.");
    expect(error.providerName).toBe("example");
  });

  it("uses the unknown name for empty and invalid runtime names", () => {
    expect(new ProviderError("Failed.", "").providerName).toBe("<unknown>");
    expect(new ProviderError("Failed.", "  ").providerName).toBe("<unknown>");
    expect(
      new ProviderError("Failed.", 42 as unknown as string).providerName,
    ).toBe("<unknown>");
  });

  it("creates a deterministic unavailable error", () => {
    const error = new ProviderUnavailableError("ollama");

    expect(error.name).toBe("ProviderUnavailableError");
    expect(error.message).toBe('Provider "ollama" is unavailable.');
    expect(error.providerName).toBe("ollama");
  });

  it("supports a custom unavailable message", () => {
    expect(
      new ProviderUnavailableError("ollama", "Ollama is offline.").message,
    ).toBe("Ollama is offline.");
  });

  it("creates a deterministic request error", () => {
    const error = new ProviderRequestError(
      "ollama",
      "Provider request failed.",
    );

    expect(error.name).toBe("ProviderRequestError");
    expect(error.message).toBe("Provider request failed.");
    expect(error.providerName).toBe("ollama");
  });

  it("creates a deterministic timeout error and exposes its timeout", () => {
    const error = new ProviderTimeoutError("ollama", 5000);

    expect(error.name).toBe("ProviderTimeoutError");
    expect(error.message).toBe(
      'Provider "ollama" request timed out after 5000 ms.',
    );
    expect(error.providerName).toBe("ollama");
    expect(error.timeoutMs).toBe(5000);
  });

  it("creates a deterministic abort error", () => {
    const error = new ProviderAbortError("ollama");

    expect(error.name).toBe("ProviderAbortError");
    expect(error.message).toBe('Provider "ollama" request was aborted.');
    expect(error.providerName).toBe("ollama");
  });

  it("makes every specialized error a ProviderError", () => {
    const errors = [
      new ProviderUnavailableError("example"),
      new ProviderRequestError("example", "Request failed."),
      new ProviderTimeoutError("example", 1000),
      new ProviderAbortError("example"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(ProviderError);
    }
  });

  it("preserves native causes for every error class", () => {
    const cause = new Error("root cause");
    const errors = [
      new ProviderError("Failed.", "example", { cause }),
      new ProviderUnavailableError("example", undefined, { cause }),
      new ProviderRequestError("example", "Failed.", { cause }),
      new ProviderTimeoutError("example", 1000, { cause }),
      new ProviderAbortError("example", { cause }),
    ];

    for (const error of errors) {
      expect(error.cause).toBe(cause);
    }
  });
});
