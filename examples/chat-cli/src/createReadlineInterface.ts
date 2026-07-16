import { createInterface } from "node:readline/promises";
import type { Interface } from "node:readline/promises";

export function createReadlineInterface(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Interface {
  return createInterface({ input, output });
}
