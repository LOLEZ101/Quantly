import type { ReviewItem } from "../../domain/types.js";

export interface ReviewItemsRepository {
  replaceAll(items: ReviewItem[], processingRunId: string): Promise<number>;
  list(processingRunId: string): Promise<ReviewItem[]>;
}

export class InMemoryReviewItemsRepository implements ReviewItemsRepository {
  private byRun = new Map<string, ReviewItem[]>();

  async replaceAll(items: ReviewItem[], processingRunId: string) {
    this.byRun.set(processingRunId, items);
    return items.length;
  }

  async list(processingRunId: string) {
    return this.byRun.get(processingRunId) ?? [];
  }
}
