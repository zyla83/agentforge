import {
  ConversationProviderNotFoundError,
  InvalidConversationTurnError,
  createAgentProfile,
  createConversation,
  createConversationEngine,
} from "@agentforge/core";
import { MockLLMProvider } from "@agentforge/provider-mock";
import { LLMMessageRole } from "@agentforge/provider-sdk";
import type { LLMProvider } from "@agentforge/provider-sdk";
import { describe, expect, it } from "vitest";

const timestamp = "2020-01-01T00:00:00.000Z";

function resolver(
  providers: Record<string, LLMProvider>,
  defaultName?: string,
) {
  return {
    getLLMProvider: (name: string) => providers[name],
    getDefaultLLMProvider: () =>
      defaultName === undefined ? undefined : providers[defaultName],
  };
}

function profile(overrides = {}) {
  return createAgentProfile({
    id: "engine-profile",
    systemPrompt: "Profile instruction.",
    model: "profile-model",
    provider: "profile-provider",
    generation: { temperature: 0.2, topP: 0.8, stop: ["PROFILE_END"] },
    ...overrides,
  });
}

describe("ConversationEngine profile complete turns", () => {
  it("prepends the profile prompt only to the provider request", async () => {
    const provider = new MockLLMProvider({
      name: "profile-provider",
      responseContent: "Answer",
    });
    let identities = 0;
    let timestamps = 0;
    const source = createConversation({
      id: "conversation",
      createdAt: timestamp,
      messages: [
        {
          id: "stored-system",
          role: LLMMessageRole.System,
          content: "Stored instruction.",
          createdAt: timestamp,
        },
      ],
    });
    const engine = createConversationEngine({
      providers: resolver({ "profile-provider": provider }),
      profile: profile(),
      conversationFactory: {
        idGenerator: () => `generated-${++identities}`,
        now: () => {
          timestamps += 1;
          return new Date(`2020-01-01T00:00:0${timestamps}.000Z`);
        },
      },
    });

    const result = await engine.runTurn({
      conversation: source,
      content: "Question",
    });

    expect(provider.getRequests()[0]?.messages).toEqual([
      { role: LLMMessageRole.System, content: "Profile instruction." },
      { role: LLMMessageRole.System, content: "Stored instruction." },
      { role: LLMMessageRole.User, content: "Question" },
    ]);
    expect(Object.isFrozen(provider.getRequests()[0]?.messages)).toBe(true);
    expect(Object.isFrozen(provider.getRequests()[0]?.messages[0])).toBe(true);
    expect(result.conversation.messages.map(({ content }) => content)).toEqual([
      "Stored instruction.",
      "Question",
      "Answer",
    ]);
    expect(source.messages).toHaveLength(1);
    expect(identities).toBe(2);
    expect(timestamps).toBe(2);
    expect(result).toMatchObject({
      provider: "profile-provider",
      model: "profile-model",
      profile: "engine-profile",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("uses explicit model and provider before profile defaults", async () => {
    const profileProvider = new MockLLMProvider({ name: "profile-provider" });
    const explicitProvider = new MockLLMProvider({ name: "explicit-provider" });
    const result = await createConversationEngine({
      providers: resolver({
        "profile-provider": profileProvider,
        "explicit-provider": explicitProvider,
      }),
      profile: profile(),
    }).runTurn({
      conversation: createConversation(),
      content: "Question",
      model: "explicit-model",
      provider: "explicit-provider",
    });

    expect(result).toMatchObject({
      provider: "explicit-provider",
      model: "explicit-model",
      profile: "engine-profile",
    });
    expect(profileProvider.getRequests()).toEqual([]);
  });

  it("uses a per-turn profile as a full replacement", async () => {
    const turnProvider = new MockLLMProvider({ name: "turn-provider" });
    const engine = createConversationEngine({
      providers: resolver({ "turn-provider": turnProvider }),
      profile: profile(),
    });
    const turnProfile = profile({
      id: "turn-profile",
      systemPrompt: "Turn instruction.",
      model: "turn-model",
      provider: "turn-provider",
      generation: { maxTokens: 20 },
    });

    const result = await engine.runTurn({
      conversation: createConversation(),
      content: "Question",
      profile: turnProfile,
    });

    expect(result.profile).toBe("turn-profile");
    expect(turnProvider.getRequests()[0]).toMatchObject({
      model: "turn-model",
      generation: { maxTokens: 20 },
      messages: [
        { role: LLMMessageRole.System, content: "Turn instruction." },
        { role: LLMMessageRole.User, content: "Question" },
      ],
    });
  });

  it("merges generation fields and replaces stop sequences", async () => {
    const provider = new MockLLMProvider({ name: "profile-provider" });
    const turnGeneration = { temperature: 0.7, stop: ["TURN_END"] };
    const selectedProfile = profile();

    await createConversationEngine({
      providers: resolver({ "profile-provider": provider }),
      profile: selectedProfile,
    }).runTurn({
      conversation: createConversation(),
      content: "Question",
      generation: turnGeneration,
    });

    expect(provider.getRequests()[0]?.generation).toEqual({
      temperature: 0.7,
      topP: 0.8,
      stop: ["TURN_END"],
    });
    expect(provider.getRequests()[0]?.generation).not.toBe(turnGeneration);
    expect(selectedProfile.generation).toEqual({
      temperature: 0.2,
      topP: 0.8,
      stop: ["PROFILE_END"],
    });
    expect(turnGeneration).toEqual({ temperature: 0.7, stop: ["TURN_END"] });
  });

  it("preserves profile-free behavior and reports undefined profile metadata", async () => {
    const provider = new MockLLMProvider({ name: "default" });
    const result = await createConversationEngine({
      providers: resolver({ default: provider }, "default"),
    }).runTurn({
      conversation: createConversation(),
      content: "Question",
      model: "model",
    });

    expect(result.profile).toBeUndefined();
    expect(provider.getRequests()[0]?.messages[0]).toEqual({
      role: LLMMessageRole.User,
      content: "Question",
    });
  });

  it("snapshots a mutable engine profile and uses the default provider when unnamed", async () => {
    const provider = new MockLLMProvider({ name: "default" });
    const stop = ["ORIGINAL"];
    const mutableProfile = {
      id: "snapshot",
      systemPrompt: "Original prompt.",
      model: "original-model",
      generation: { temperature: 0.2, stop },
    };
    const engine = createConversationEngine({
      providers: resolver({ default: provider }, "default"),
      profile: mutableProfile,
    });

    mutableProfile.id = "changed";
    mutableProfile.systemPrompt = "Changed prompt.";
    mutableProfile.model = "changed-model";
    mutableProfile.generation.temperature = 0.9;
    stop[0] = "CHANGED";

    const result = await engine.runTurn({
      conversation: createConversation(),
      content: "Question",
    });

    expect(result).toMatchObject({
      profile: "snapshot",
      model: "original-model",
      provider: "default",
    });
    expect(provider.getRequests()[0]).toMatchObject({
      model: "original-model",
      generation: { temperature: 0.2, stop: ["ORIGINAL"] },
      messages: [
        { role: LLMMessageRole.System, content: "Original prompt." },
        { role: LLMMessageRole.User, content: "Question" },
      ],
    });
  });

  it("rejects a missing or malformed explicit model without fallback", async () => {
    const provider = new MockLLMProvider({ name: "default" });
    const withoutProfile = createConversationEngine({
      providers: resolver({ default: provider }, "default"),
    });
    await expect(
      withoutProfile.runTurn({
        conversation: createConversation(),
        content: "Question",
      }),
    ).rejects.toMatchObject({
      details: ["model: is required when no profile model is available"],
    });

    await expect(
      createConversationEngine({
        providers: resolver({ "profile-provider": provider }),
        profile: profile(),
      }).runTurn({
        conversation: createConversation(),
        content: "Question",
        model: " ",
      }),
    ).rejects.toBeInstanceOf(InvalidConversationTurnError);
    expect(provider.getRequests()).toEqual([]);
  });

  it("does not fall back when the selected profile provider is missing", async () => {
    const fallback = new MockLLMProvider({ name: "default" });
    await expect(
      createConversationEngine({
        providers: resolver({ default: fallback }, "default"),
        profile: profile(),
      }).runTurn({
        conversation: createConversation(),
        content: "Question",
      }),
    ).rejects.toBeInstanceOf(ConversationProviderNotFoundError);
    expect(fallback.getRequests()).toEqual([]);
  });
});
