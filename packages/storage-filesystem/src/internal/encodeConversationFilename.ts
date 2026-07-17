const FILENAME_PATTERN = /^([A-Za-z0-9_-]+)\.json$/u;

export function encodeConversationFilename(conversationId: string): string {
  return `${Buffer.from(conversationId, "utf8").toString("base64url")}.json`;
}

export function decodeConversationFilename(
  filename: string,
): string | undefined {
  const match = FILENAME_PATTERN.exec(filename);
  const encoded = match?.[1];
  if (encoded === undefined) return undefined;

  try {
    const bytes = Buffer.from(encoded, "base64url");
    const conversationId = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes,
    );
    if (conversationId.trim().length === 0) return undefined;
    return encodeConversationFilename(conversationId) === filename
      ? conversationId
      : undefined;
  } catch {
    return undefined;
  }
}
