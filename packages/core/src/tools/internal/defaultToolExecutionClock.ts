import type { ToolExecutionClock } from "../ToolExecutionObservability.js";

export const defaultToolExecutionClock: ToolExecutionClock = Object.freeze({
  now: () => new Date(),
  monotonicNow: () => performance.now(),
});
