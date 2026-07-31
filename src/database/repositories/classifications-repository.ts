import type { ClassificationResult } from "../../domain/types.js";

export interface ClassificationsRepository {
  replaceAll(
    classifications: ClassificationResult[],
    processingRunId: string
  ): Promise<number>;
  list(processingRunId: string): Promise<ClassificationResult[]>;
}

export class InMemoryClassificationsRepository
  implements ClassificationsRepository
{
  private byRun = new Map<string, ClassificationResult[]>();

  async replaceAll(
    classifications: ClassificationResult[],
    processingRunId: string
  ) {
    this.byRun.set(processingRunId, classifications);
    return classifications.length;
  }

  async list(processingRunId: string) {
    return this.byRun.get(processingRunId) ?? [];
  }
}
