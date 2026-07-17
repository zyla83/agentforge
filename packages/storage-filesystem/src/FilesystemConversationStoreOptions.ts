export interface FilesystemConversationStoreOptions {
  readonly directory: string;
  readonly now?: () => Date;
  readonly pretty?: boolean;
}
