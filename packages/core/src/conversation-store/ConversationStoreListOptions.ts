export enum ConversationStoreOrder {
  UpdatedDescending = "updated-desc",
  UpdatedAscending = "updated-asc",
}

export interface ConversationStoreListOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly order?: ConversationStoreOrder;
}
