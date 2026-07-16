import {
  InvalidLLMRequestError,
  LLMMessageRole,
  validateLLMGenerationRequest,
} from "@agentforge/provider-sdk";
import type { AgentProfile } from "../AgentProfile.js";
import { InvalidAgentProfileError } from "../errors/index.js";
import { isNonEmptyString, isRecord } from "./validation.js";

export function validateAgentProfile(profile: AgentProfile): void {
  const value: unknown = profile;
  if (!isRecord(value)) {
    throw new InvalidAgentProfileError(["profile: must be an object"]);
  }

  const details: string[] = [];
  if (!isNonEmptyString(value.id)) {
    details.push("id: must be a non-empty string");
  }
  if (!isNonEmptyString(value.systemPrompt)) {
    details.push("systemPrompt: must be a non-empty string");
  }
  if (value.model !== undefined && !isNonEmptyString(value.model)) {
    details.push("model: must be a non-empty string when provided");
  }
  if (value.provider !== undefined && !isNonEmptyString(value.provider)) {
    details.push("provider: must be a non-empty string when provided");
  }

  let cause: InvalidLLMRequestError | undefined;
  try {
    validateLLMGenerationRequest({
      model: "profile-validation-model",
      messages: [
        { role: LLMMessageRole.User, content: "profile validation message" },
      ],
      ...(value.generation === undefined
        ? {}
        : { generation: value.generation as never }),
    });
  } catch (error) {
    if (!(error instanceof InvalidLLMRequestError)) throw error;
    cause = error;
    details.push(
      ...error.details.filter(
        (detail) =>
          detail.startsWith("generation:") || detail.startsWith("generation."),
      ),
    );
  }

  if (details.length > 0) {
    throw new InvalidAgentProfileError(
      details,
      cause === undefined ? undefined : { cause },
    );
  }
}
