import process from "node:process";
import type { Interface } from "node:readline/promises";
import {
  ConversationTurnAbortedError,
  createConversation,
  createConversationTurnController,
} from "@agentforge/core";
import type {
  AgentProfile,
  Conversation,
  ConversationEngine,
  ConversationTurnController,
} from "@agentforge/core";
import { ProviderAbortError } from "@agentforge/provider-sdk";
import type { ChatApplicationOptions } from "./ChatApplicationOptions.js";
import { ChatCommandType } from "./ChatCommand.js";
import type { ChatCommand } from "./ChatCommand.js";
import { createReadlineInterface } from "./createReadlineInterface.js";
import { formatChatError } from "./formatChatError.js";
import { parseChatCommand } from "./parseChatCommand.js";

const HELP_TEXT = `Commands:
  /help   Show available commands
  /info   Show current configuration
  /reset  Start a new conversation
  /exit   Exit the chat
`;

export class ChatApplication {
  private readonly engine: ConversationEngine;
  private readonly profile: AgentProfile;
  private readonly timeoutMs: number;
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly errorOutput: NodeJS.WritableStream;
  private conversation: Conversation;
  private activeController: ConversationTurnController | undefined;
  private promptController: AbortController | undefined;
  private readline: Interface | undefined;
  private running = false;
  private assistantLineOpen = false;

  constructor(options: ChatApplicationOptions) {
    this.engine = options.engine;
    this.profile = options.profile;
    this.conversation = options.initialConversation;
    this.timeoutMs = options.timeoutMs;
    this.input = options.input;
    this.output = options.output;
    this.errorOutput = options.errorOutput;
  }

  async run(): Promise<void> {
    this.running = true;
    this.readline = createReadlineInterface(this.input, this.output);
    this.input.on("end", this.handleInputEnd);
    process.on("SIGINT", this.handleSigint);
    process.on("SIGTERM", this.handleSigterm);
    this.printBanner();

    try {
      while (this.running) {
        let line: string;
        const promptController = new AbortController();
        this.promptController = promptController;
        try {
          line = await this.readline.question("You: ", {
            signal: promptController.signal,
          });
        } catch (error) {
          if (!this.running || isReadlineClosedError(error)) {
            this.running = false;
            break;
          }
          throw error;
        } finally {
          if (this.promptController === promptController) {
            this.promptController = undefined;
          }
        }

        const command = parseChatCommand(line);
        if (command !== undefined) {
          this.handleCommand(command);
          continue;
        }
        if (line.trim().length === 0) continue;
        await this.executeTurn(line);
      }
    } finally {
      this.running = false;
      this.promptController?.abort();
      this.cancelActiveTurn(new Error("Chat application closed"));
      this.closeReadline();
      this.input.off("end", this.handleInputEnd);
      process.off("SIGINT", this.handleSigint);
      process.off("SIGTERM", this.handleSigterm);
    }
  }

  cancelActiveTurn(reason?: unknown): void {
    this.activeController?.abort(reason);
  }

  private readonly handleSigint = (): void => {
    if (this.activeController !== undefined) {
      if (this.assistantLineOpen) this.output.write("\n");
      this.output.write("Cancelling current response...\n");
      this.assistantLineOpen = false;
      this.cancelActiveTurn(new Error("Terminal interrupt requested"));
      return;
    }
    this.requestExit(new Error("Terminal interrupt requested"));
  };

  private readonly handleSigterm = (): void => {
    this.requestExit(new Error("Process termination requested"));
  };

  private readonly handleInputEnd = (): void => {
    this.requestExit(new Error("Standard input closed"));
  };

  private requestExit(reason: unknown): void {
    this.running = false;
    this.promptController?.abort(reason);
    this.cancelActiveTurn(reason);
    this.closeReadline();
  }

  private handleCommand(command: Readonly<ChatCommand>): void {
    switch (command.type) {
      case ChatCommandType.Exit:
        this.requestExit(new Error("Chat exit requested"));
        break;
      case ChatCommandType.Reset:
        this.conversation = createConversation();
        this.output.write("Conversation reset.\n");
        break;
      case ChatCommandType.Help:
        this.output.write(HELP_TEXT);
        break;
      case ChatCommandType.Info:
        this.output.write(
          `Profile: ${this.profile.id}\nProvider: ${this.profile.provider ?? "default"}\nModel: ${this.profile.model ?? "unspecified"}\nMessages: ${this.conversation.messages.length}\n`,
        );
        break;
    }
  }

  private async executeTurn(content: string): Promise<void> {
    const controller = createConversationTurnController();
    this.activeController = controller;
    let completedConversation: Conversation | undefined;
    let receivedNonEmptyDelta = false;
    this.output.write("Assistant: ");
    this.assistantLineOpen = true;

    try {
      for await (const event of this.engine.streamTurn({
        conversation: this.conversation,
        content,
        request: {
          timeoutMs: this.timeoutMs,
          signal: controller.signal,
        },
      })) {
        if (event.type === "delta") {
          this.output.write(event.delta);
          if (event.delta.length > 0) receivedNonEmptyDelta = true;
          this.assistantLineOpen = !event.delta.endsWith("\n");
        }
        if (event.type === "completed") {
          completedConversation = event.conversation;
          if (!receivedNonEmptyDelta) {
            const completedContent = event.assistantMessage.content;
            this.output.write(completedContent);
            if (completedContent.length > 0) {
              this.assistantLineOpen = !completedContent.endsWith("\n");
            }
          }
        }
      }

      if (completedConversation === undefined) {
        throw new Error(
          "The conversation turn ended without a completed event.",
        );
      }
      if (this.assistantLineOpen) this.output.write("\n");
      this.assistantLineOpen = false;
      this.conversation = completedConversation;
    } catch (error) {
      if (this.assistantLineOpen) this.output.write("\n");
      this.assistantLineOpen = false;
      if (
        controller.aborted &&
        (error instanceof ConversationTurnAbortedError ||
          error instanceof ProviderAbortError)
      ) {
        this.output.write("Response cancelled.\n");
      } else {
        this.errorOutput.write(`${formatChatError(error)}\n`);
      }
    } finally {
      if (this.activeController === controller) {
        this.activeController = undefined;
      }
    }
  }

  private printBanner(): void {
    this.output.write(
      `AgentForge Interactive Chat\nProvider: ${this.profile.provider ?? "default"}\nModel: ${this.profile.model ?? "unspecified"}\nType /help for commands.\n`,
    );
  }

  private closeReadline(): void {
    try {
      this.readline?.close();
    } catch {
      // Closing an already closed readline interface is harmless during cleanup.
    }
  }
}

function isReadlineClosedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes("readline was closed") ||
      ("code" in error && error.code === "ERR_USE_AFTER_CLOSE"))
  );
}
