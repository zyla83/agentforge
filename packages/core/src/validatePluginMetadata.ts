import type { Plugin, PluginMetadata } from "@agentforge/plugin-sdk";
import {
  InvalidPluginDescriptionError,
  InvalidPluginNameError,
  InvalidPluginVersionError,
} from "@agentforge/shared";

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function snapshotPluginMetadata(
  plugin: Plugin,
): Readonly<PluginMetadata> {
  const pluginValue: unknown = plugin;
  const metadata = isRecord(pluginValue) ? pluginValue.metadata : undefined;

  if (!isRecord(metadata)) {
    throw new InvalidPluginNameError();
  }

  const { name, version, description } = metadata;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new InvalidPluginNameError();
  }

  if (
    typeof version !== "string" ||
    SEMANTIC_VERSION_PATTERN.exec(version)?.[0] !== version
  ) {
    throw new InvalidPluginVersionError(name, version);
  }

  if (
    description !== undefined &&
    (typeof description !== "string" || description.trim().length === 0)
  ) {
    throw new InvalidPluginDescriptionError(name);
  }

  const snapshot: PluginMetadata =
    description === undefined
      ? { name, version }
      : { name, version, description };

  return Object.freeze(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
