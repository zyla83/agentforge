export class AgentProfileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentProfileError";
  }
}
