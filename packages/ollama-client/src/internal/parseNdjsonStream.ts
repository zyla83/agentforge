import { OllamaResponseError } from "../errors/OllamaResponseError.js";

export interface ParsedNdjsonValue {
  readonly index: number;
  readonly value: unknown;
}

export async function* parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
  endpoint: string,
): AsyncIterable<ParsedNdjsonValue> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let index = 0;
  let reachedEnd = false;

  const parseLine = (line: string): ParsedNdjsonValue | undefined => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (normalized.trim().length === 0) return undefined;
    try {
      return { index: index++, value: JSON.parse(normalized) as unknown };
    } catch (error) {
      throw new OllamaResponseError(
        endpoint,
        [`stream[${index}]: must contain valid JSON`],
        { cause: error },
      );
    }
  };

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        reachedEnd = true;
        buffer += decoder.decode();
        const parsed = parseLine(buffer);
        if (parsed !== undefined) yield parsed;
        return;
      }

      buffer += decoder.decode(result.value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const parsed = parseLine(line);
        if (parsed !== undefined) yield parsed;
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // Cancellation cleanup must not replace the stream's original result.
      }
    }
    reader.releaseLock();
  }
}
