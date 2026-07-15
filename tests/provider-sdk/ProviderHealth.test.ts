import {
  ProviderHealthStatus,
  degradedProvider,
  healthyProvider,
  unavailableProvider,
} from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

describe("provider health results", () => {
  it("creates a healthy result without optional fields", () => {
    const health = healthyProvider();

    expect(health).toEqual({ status: ProviderHealthStatus.Healthy });
    expect(health).not.toHaveProperty("message");
    expect(health).not.toHaveProperty("details");
  });

  it("creates a healthy result with a message", () => {
    expect(healthyProvider("Provider is ready.")).toEqual({
      status: ProviderHealthStatus.Healthy,
      message: "Provider is ready.",
    });
  });

  it("creates a degraded result", () => {
    expect(degradedProvider("Provider is partially impaired.")).toEqual({
      status: ProviderHealthStatus.Degraded,
      message: "Provider is partially impaired.",
    });
  });

  it("creates an unavailable result", () => {
    expect(unavailableProvider("Provider cannot be reached.")).toEqual({
      status: ProviderHealthStatus.Unavailable,
      message: "Provider cannot be reached.",
    });
  });

  it("shallow-copies and freezes structured details", () => {
    const nested = { endpoint: "local" };
    const details = { attempts: 2, nested };
    const health = degradedProvider("Connection is unstable.", details);

    expect(health.details).toEqual(details);
    expect(health.details).not.toBe(details);
    expect(Object.isFrozen(health)).toBe(true);
    expect(Object.isFrozen(health.details)).toBe(true);
    expect(Object.isFrozen(health.details?.nested)).toBe(false);
    expect(details).toEqual({ attempts: 2, nested });
  });

  it("does not retain the caller-owned details object", () => {
    const details = { endpoint: "primary" };
    const health = healthyProvider("Provider is ready.", details);

    details.endpoint = "mutated";

    expect(health.details).toEqual({ endpoint: "primary" });
  });
});
