import type {
  ToolExecutionObserver,
  ToolExecutionObserverEvent,
} from "../ToolExecutionObservability.js";

export class ToolExecutionObserverDispatcher {
  readonly enabled: boolean;
  private readonly observers: readonly ToolExecutionObserver[];

  constructor(observers: readonly ToolExecutionObserver[]) {
    this.observers = Object.freeze([...observers]);
    this.enabled = this.observers.length > 0;
  }

  emit(event: Readonly<ToolExecutionObserverEvent>): void {
    for (const observer of this.observers) {
      try {
        observer(event);
      } catch {
        // Diagnostic observers cannot affect tool or conversation behavior.
      }
    }
  }
}
