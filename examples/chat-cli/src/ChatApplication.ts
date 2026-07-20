import process from "node:process";
import type { Interface } from "node:readline/promises";
import {
  ConversationStoreOrder,
  ConversationTurnAbortedError,
  createConversation,
  createConversationTurnController,
} from "@agentforge/core";
import type {
  AgentProfile,
  Conversation,
  ConversationEngine,
  ConversationStore,
  ConversationTurnController,
} from "@agentforge/core";
import { ProviderAbortError } from "@agentforge/provider-sdk";
import type { ChatApplicationOptions } from "./ChatApplicationOptions.js";
import type { ChatApplicationToolOptions } from "./ChatApplicationOptions.js";
import { ChatCommandType } from "./ChatCommand.js";
import type { ChatCommand } from "./ChatCommand.js";
import { formatConversationList } from "./commands/formatConversationList.js";
import { createReadlineInterface } from "./createReadlineInterface.js";
import { readImportedConversation } from "./files/readImportedConversation.js";
import { writeExportedConversation } from "./files/writeExportedConversation.js";
import { formatChatError } from "./formatChatError.js";
import { parseChatCommand } from "./parseChatCommand.js";
import {
  formatToolCallCompleted,
  formatToolCallStarted,
} from "./tools/formatToolEvent.js";

const HELP_TEXT = `Commands:
  /help                       Show available commands
  /info                       Show current configuration
  /reset                      Start and save a new conversation
  /save                       Save the current conversation
  /list                       List saved conversations
  /load <conversation-id>     Load a saved conversation
  /delete <conversation-id>   Delete a saved conversation
  /export <file-path>         Export the current conversation
  /import <file-path>         Import and save a conversation
  /exit                       Exit the chat
  /quit                       Exit the chat

Tool configuration:
  Set AGENTFORGE_CHAT_TOOLS=example to enable the bundled example tools.
  Available: calculator, format_text, lookup_inventory
`;

export class ChatApplication {
  private readonly engine: ConversationEngine;
  private readonly profile: AgentProfile;
  private readonly store: ConversationStore;
  private readonly dataDirectory: string;
  private readonly timeoutMs: number;
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly errorOutput: NodeJS.WritableStream;
  private readonly tools: Readonly<ChatApplicationToolOptions>;
  private conversation: Conversation;
  private currentRevision: number | undefined;
  private activeController: ConversationTurnController | undefined;
  private promptController: AbortController | undefined;
  private readline: Interface | undefined;
  private running = false;
  private assistantLineOpen = false;

  constructor(options: ChatApplicationOptions) {
    this.engine = options.engine;
    this.profile = options.profile;
    this.store = options.store;
    this.conversation = options.initialEntry.conversation;
    this.currentRevision = options.initialEntry.revision;
    this.dataDirectory = options.dataDirectory;
    this.timeoutMs = options.timeoutMs;
    this.input = options.input;
    this.output = options.output;
    this.errorOutput = options.errorOutput;
    this.tools = Object.freeze({
      mode: options.tools.mode,
      definitions: Object.freeze([...options.tools.definitions]),
    });
  }

  async run(): Promise<void> {
    this.running = true;
    this.readline = createReadlineInterface(this.input, this.output);
    this.readline.on("SIGINT", this.handleSigint);
    this.input.on("end", this.handleInputEnd);
    process.on("SIGINT", this.handleSigint);
    process.on("SIGTERM", this.handleSigterm);

    try {
      this.printBanner();
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

        try {
          const command = parseChatCommand(line);
          if (command !== undefined) {
            await this.handleCommand(command);
            continue;
          }
        } catch (error) {
          this.errorOutput.write(`${formatChatError(error)}\n`);
          continue;
        }
        if (line.trim().length === 0) continue;
        await this.executeTurn(line);
      }
    } finally {
      this.running = false;
      this.promptController?.abort();
      this.cancelActiveTurn(new Error("Chat application closed"));
      this.readline?.off("SIGINT", this.handleSigint);
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
      if (this.activeController.aborted) return;
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

  private async handleCommand(command: Readonly<ChatCommand>): Promise<void> {
    switch (command.type) {
      case ChatCommandType.Exit:
        this.requestExit(new Error("Chat exit requested"));
        return;
      case ChatCommandType.Reset:
        await this.resetConversation();
        return;
      case ChatCommandType.Help:
        this.output.write(HELP_TEXT);
        return;
      case ChatCommandType.Info:
        this.printInfo();
        return;
      case ChatCommandType.Save:
        await this.saveConversation();
        return;
      case ChatCommandType.List:
        await this.listConversations();
        return;
      case ChatCommandType.Load:
        await this.loadConversation(command.conversationId);
        return;
      case ChatCommandType.Delete:
        await this.deleteConversation(command.conversationId);
        return;
      case ChatCommandType.Export:
        await this.exportConversation(command.filePath);
        return;
      case ChatCommandType.Import:
        await this.importConversation(command.filePath);
    }
  }

  private async saveConversation(): Promise<void> {
    const entry = await this.store.save(this.conversation);
    this.currentRevision = entry.revision;
    this.output.write(
      `Conversation saved.\nID: ${entry.conversation.id}\nRevision: ${entry.revision}\n`,
    );
  }

  private async resetConversation(): Promise<void> {
    const entry = await this.store.save(createConversation());
    this.conversation = entry.conversation;
    this.currentRevision = entry.revision;
    this.output.write(
      `Conversation reset.\nID: ${entry.conversation.id}\nRevision: ${entry.revision}\n`,
    );
  }

  private async listConversations(): Promise<void> {
    const result = await this.store.list({
      limit: 100,
      order: ConversationStoreOrder.UpdatedDescending,
    });
    this.output.write(
      formatConversationList(
        result.entries,
        this.conversation.id,
        result.nextCursor !== undefined,
      ),
    );
  }

  private async loadConversation(conversationId: string): Promise<void> {
    const entry = await this.store.require(conversationId);
    this.conversation = entry.conversation;
    this.currentRevision = entry.revision;
    this.output.write(
      `Conversation loaded.\nID: ${entry.conversation.id}\nMessages: ${entry.conversation.messages.length}\nRevision: ${entry.revision}\nUpdated: ${entry.conversation.updatedAt}\n`,
    );
  }

  private async deleteConversation(conversationId: string): Promise<void> {
    const existed = await this.store.delete(conversationId);
    this.output.write(
      existed
        ? `Conversation deleted: ${conversationId}\n`
        : `Conversation not found: ${conversationId}\n`,
    );
    if (existed && conversationId === this.conversation.id) {
      this.currentRevision = undefined;
      this.output.write(
        "The active conversation remains in memory and is now unsaved.\n",
      );
    }
  }

  private async exportConversation(filePath: string): Promise<void> {
    const resolvedPath = await writeExportedConversation(
      filePath,
      this.conversation,
    );
    this.output.write(`Conversation exported to:\n${resolvedPath}\n`);
  }

  private async importConversation(filePath: string): Promise<void> {
    const imported = await readImportedConversation(filePath);
    const existing = await this.store.get(imported.conversation.id);
    const entry = await this.store.save(imported.conversation);
    this.conversation = entry.conversation;
    this.currentRevision = entry.revision;
    this.output.write(
      `Conversation imported.\nID: ${entry.conversation.id}\nMessages: ${entry.conversation.messages.length}\nRevision: ${entry.revision}\nSource: ${imported.filePath}\n`,
    );
    if (existing !== undefined) {
      this.output.write(
        `Existing stored conversation replaced at revision ${entry.revision}.\n`,
      );
    }
  }

  private printInfo(): void {
    const toolNames = this.getToolNames();
    this.output.write(
      `Profile: ${this.profile.id}\nProvider: ${this.profile.provider ?? "default"}\nModel: ${this.profile.model ?? "unspecified"}\nTools mode: ${this.tools.mode}\nRegistered tools: ${toolNames.length > 0 ? toolNames.join(", ") : "none"}\nTool execution: ${this.tools.mode === "example" ? "enabled" : "disabled"}\nConversation ID: ${this.conversation.id}\nMessages: ${this.conversation.messages.length}\nRevision: ${this.currentRevision ?? "unsaved"}\nData directory: ${this.dataDirectory}\n`,
    );
  }

  private async executeTurn(content: string): Promise<void> {
    const controller = createConversationTurnController();
    this.activeController = controller;
    let completedConversation: Conversation | undefined;
    let receivedNonEmptyDelta = false;
    let assistantPrefixWritten = false;

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
          if (event.delta.length === 0) continue;
          if (!assistantPrefixWritten) {
            this.output.write("Assistant: ");
            assistantPrefixWritten = true;
          }
          this.output.write(event.delta);
          receivedNonEmptyDelta = true;
          this.assistantLineOpen = !event.delta.endsWith("\n");
        }
        if (event.type === "tool-call-started") {
          this.closeAssistantLine();
          assistantPrefixWritten = false;
          this.output.write(`${formatToolCallStarted(event.call)}\n`);
        }
        if (event.type === "tool-call-completed") {
          this.closeAssistantLine();
          assistantPrefixWritten = false;
          this.output.write(`${formatToolCallCompleted(event.result)}\n`);
        }
        if (event.type === "completed") {
          completedConversation = event.conversation;
          if (!receivedNonEmptyDelta) {
            const completedContent = event.assistantMessage.content;
            if (completedContent.length > 0) {
              this.output.write(`Assistant: ${completedContent}`);
              assistantPrefixWritten = true;
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
      this.closeAssistantLine();

      try {
        const entry = await this.store.save(completedConversation);
        this.conversation = entry.conversation;
        this.currentRevision = entry.revision;
      } catch (error) {
        this.errorOutput.write(
          "The response was generated but could not be persisted. The previous conversation remains active.\n",
        );
        this.errorOutput.write(`${formatChatError(error)}\n`);
      }
    } catch (error) {
      this.closeAssistantLine();
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
    const toolNames = this.getToolNames();
    const tools =
      this.tools.mode === "example"
        ? `example (${toolNames.join(", ")})`
        : "off";
    this.output.write(
      `AgentForge Interactive Chat\nProvider: ${this.profile.provider ?? "default"}\nModel: ${this.profile.model ?? "unspecified"}\nTools: ${tools}\nType /help for commands.\n`,
    );
  }

  private getToolNames(): readonly string[] {
    return this.tools.definitions.map(({ name }) => name);
  }

  private closeAssistantLine(): void {
    if (this.assistantLineOpen) this.output.write("\n");
    this.assistantLineOpen = false;
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
