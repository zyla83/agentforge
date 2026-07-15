export enum ProviderHealthStatus {
  Healthy = "healthy",
  Degraded = "degraded",
  Unavailable = "unavailable",
}

export interface ProviderHealth {
  readonly status: ProviderHealthStatus;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function healthyProvider(
  message?: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderHealth {
  return createProviderHealth(ProviderHealthStatus.Healthy, message, details);
}

export function degradedProvider(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderHealth {
  return createProviderHealth(ProviderHealthStatus.Degraded, message, details);
}

export function unavailableProvider(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderHealth {
  return createProviderHealth(
    ProviderHealthStatus.Unavailable,
    message,
    details,
  );
}

function createProviderHealth(
  status: ProviderHealthStatus,
  message?: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderHealth {
  const health: {
    status: ProviderHealthStatus;
    message?: string;
    details?: Readonly<Record<string, unknown>>;
  } = { status };

  if (message !== undefined) {
    health.message = message;
  }

  if (details !== undefined) {
    health.details = Object.freeze({ ...details });
  }

  return Object.freeze(health);
}
