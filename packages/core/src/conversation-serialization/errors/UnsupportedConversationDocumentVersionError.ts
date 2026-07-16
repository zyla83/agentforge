import { ConversationSerializationError } from "./ConversationSerializationError.js";

export class UnsupportedConversationDocumentVersionError extends ConversationSerializationError {
  readonly documentKind: string;
  readonly version: number;
  readonly supportedVersions: readonly number[];

  constructor(
    documentKind: string,
    version: number,
    supportedVersions: readonly number[],
    options?: ErrorOptions,
  ) {
    const copiedVersions = Object.freeze([...supportedVersions]);
    super(
      `Conversation document "${documentKind}" uses unsupported version ${version}. Supported versions: ${copiedVersions.join(", ")}.`,
      options,
    );
    this.name = "UnsupportedConversationDocumentVersionError";
    this.documentKind = documentKind;
    this.version = version;
    this.supportedVersions = copiedVersions;
  }
}
