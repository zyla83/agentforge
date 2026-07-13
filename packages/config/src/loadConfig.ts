import { InvalidConfigurationError } from "@agentforge/shared";
import {
  type AgentForgeConfig,
  type AgentForgeConfigInput,
  AgentForgeConfigSchema,
} from "./AgentForgeConfig.js";

export function loadConfig(
  input?: AgentForgeConfigInput,
): Readonly<AgentForgeConfig> {
  const result = AgentForgeConfigSchema.safeParse(input ?? {});

  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      const path =
        issue.path.length > 0
          ? issue.path.join(".")
          : issue.code === "unrecognized_keys"
            ? issue.keys.join(", ")
            : "configuration";

      return `${path}: ${issue.message}`;
    });

    throw new InvalidConfigurationError(details, { cause: result.error });
  }

  return Object.freeze({
    ...result.data,
    plugins: Object.freeze({ ...result.data.plugins }),
  });
}
