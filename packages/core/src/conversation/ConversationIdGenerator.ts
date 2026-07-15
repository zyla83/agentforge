export type ConversationIdGenerator = () => string;

export interface ConversationFactoryOptions {
  readonly idGenerator?: ConversationIdGenerator;
  readonly now?: () => Date;
}
