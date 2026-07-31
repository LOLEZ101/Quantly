import type { ResolvedCompanyIdentifiers } from "../../sources/types.js";

export interface IdentifierResolutionsRepository {
  upsert(
    resolution: ResolvedCompanyIdentifiers,
    processingRunId: string
  ): Promise<void>;
  list(processingRunId: string): Promise<ResolvedCompanyIdentifiers[]>;
}

export class InMemoryIdentifierResolutionsRepository
  implements IdentifierResolutionsRepository
{
  private rows = new Map<string, ResolvedCompanyIdentifiers>();

  async upsert(resolution: ResolvedCompanyIdentifiers, processingRunId: string) {
    this.rows.set(`${processingRunId}|${resolution.company_key}`, resolution);
  }

  async list(processingRunId: string) {
    return [...this.rows.entries()]
      .filter(([k]) => k.startsWith(`${processingRunId}|`))
      .map(([, v]) => v);
  }
}
