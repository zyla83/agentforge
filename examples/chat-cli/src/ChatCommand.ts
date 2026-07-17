export enum ChatCommandType {
  Exit = "exit",
  Reset = "reset",
  Help = "help",
  Info = "info",
  Save = "save",
  List = "list",
  Load = "load",
  Delete = "delete",
  Export = "export",
  Import = "import",
}

export type ChatCommand =
  | {
      readonly type:
        | ChatCommandType.Exit
        | ChatCommandType.Reset
        | ChatCommandType.Help
        | ChatCommandType.Info
        | ChatCommandType.Save
        | ChatCommandType.List;
    }
  | {
      readonly type: ChatCommandType.Load | ChatCommandType.Delete;
      readonly conversationId: string;
    }
  | {
      readonly type: ChatCommandType.Export | ChatCommandType.Import;
      readonly filePath: string;
    };
