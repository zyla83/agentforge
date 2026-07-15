import {
  InvalidProviderMetadataError,
  type LLMProvider,
  type ProviderMetadata,
} from "@agentforge/provider-sdk";

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function snapshotProviderMetadata(
  provider: LLMProvider,
): Readonly<ProviderMetadata> {
  const providerValue: unknown = provider;

  if (!isRecord(providerValue)) {
    throw new InvalidProviderMetadataError("<unknown>", [
      "provider: must be an object",
    ]);
  }

  const metadata = providerValue.metadata;
  if (!isRecord(metadata)) {
    throw new InvalidProviderMetadataError("<unknown>", [
      "metadata: must be an object",
    ]);
  }

  const { name, version, description } = metadata;
  const details: string[] = [];

  if (typeof name !== "string" || name.trim().length === 0) {
    details.push("name: must be a non-empty string");
  }

  if (
    typeof version !== "string" ||
    SEMANTIC_VERSION_PATTERN.exec(version)?.[0] !== version
  ) {
    details.push("version: must be a valid semantic version");
  }

  if (
    description !== undefined &&
    (typeof description !== "string" || description.trim().length === 0)
  ) {
    details.push("description: must be a non-empty string");
  }

  if (details.length > 0) {
    throw new InvalidProviderMetadataError(
      typeof name === "string" ? name : "<unknown>",
      details,
    );
  }

  const snapshot: ProviderMetadata =
    description === undefined
      ? { name: name as string, version: version as string }
      : {
          name: name as string,
          version: version as string,
          description: description as string,
        };

  return Object.freeze(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
