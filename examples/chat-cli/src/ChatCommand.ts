export enum ChatCommandType {
  Exit = "exit",
  Reset = "reset",
  Help = "help",
  Info = "info",
}

export interface ChatCommand {
  readonly type: ChatCommandType;
}
