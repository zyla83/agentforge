import {
  ProviderAbortError,
  ProviderRequestError,
  throwIfProviderRequestAborted,
  validateProviderRequestOptions,
} from "@agentforge/provider-sdk";
import type { ProviderRequestOptions } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe("validateProviderRequestOptions", () => {
  it("accepts omitted options and timeout", () => {
    expect(() => validateProviderRequestOptions()).not.toThrow();
    expect(() => validateProviderRequestOptions({})).not.toThrow();
  });

  it.each([1, 10, 5_000, Number.MAX_SAFE_INTEGER])(
    "accepts positive integer timeout %s",
    (timeoutMs) => {
      expect(() => validateProviderRequestOptions({ timeoutMs })).not.toThrow();
    },
  );

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects invalid numeric timeout %s", (timeoutMs) => {
    expect(() => validateProviderRequestOptions({ timeoutMs })).toThrow(
      ProviderRequestError,
    );
  });

  it("rejects a malformed runtime timeout value", () => {
    const options = { timeoutMs: "5000" } as unknown as ProviderRequestOptions;

    expect(() => validateProviderRequestOptions(options)).toThrow(
      ProviderRequestError,
    );
  });

  it("does not mutate the supplied options", () => {
    const controller = new AbortController();
    const options = { signal: controller.signal, timeoutMs: 5000 };

    validateProviderRequestOptions(options);

    expect(options).toEqual({ signal: controller.signal, timeoutMs: 5000 });
  });

  it("uses the unknown provider name for validation errors", () => {
    const error = (() => {
      try {
        validateProviderRequestOptions({ timeoutMs: 0 });
      } catch (caughtError) {
        return caughtError;
      }

      throw new Error("Expected validation to throw.");
    })();

    expect(error).toMatchObject({ providerName: "<unknown>" });
  });
});

describe("throwIfProviderRequestAborted", () => {
  it("does nothing without a signal", () => {
    expect(() => throwIfProviderRequestAborted("example")).not.toThrow();
  });

  it("does nothing for an active signal", () => {
    const controller = new AbortController();

    expect(() =>
      throwIfProviderRequestAborted("example", {
        signal: controller.signal,
      }),
    ).not.toThrow();
  });

  it("throws an abort error with the provider name and abort reason", () => {
    const controller = new AbortController();
    const reason = new Error("cancelled by caller");
    controller.abort(reason);

    const error = (() => {
      try {
        throwIfProviderRequestAborted("example", {
          signal: controller.signal,
        });
      } catch (caughtError) {
        return caughtError;
      }

      throw new Error("Expected the abort check to throw.");
    })();

    expect(error).toBeInstanceOf(ProviderAbortError);
    expect(error).toMatchObject({
      providerName: "example",
      cause: reason,
    });
  });
});
