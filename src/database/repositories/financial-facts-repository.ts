import type { NormalizedFinancialFact } from "../../normalization/normalize-financial-fact.js";

export interface FinancialFactsRepository {
  upsertMany(
    facts: Array<NormalizedFinancialFact & { is_canonical?: boolean }>,
    processingRunId: string
  ): Promise<number>;
  listByCompany(companyKey: string): Promise<NormalizedFinancialFact[]>;
}

export class InMemoryFinancialFactsRepository implements FinancialFactsRepository {
  private rows: Array<
    NormalizedFinancialFact & { is_canonical?: boolean; processing_run_id: string }
  > = [];

  async upsertMany(
    facts: Array<NormalizedFinancialFact & { is_canonical?: boolean }>,
    processingRunId: string
  ) {
    for (const fact of facts) {
      const key = [
        fact.company_key,
        fact.concept,
        fact.unit,
        fact.end_date ?? "",
        fact.accession_number ?? "",
        fact.frame ?? "",
      ].join("|");
      const idx = this.rows.findIndex(
        (r) =>
          [
            r.company_key,
            r.concept,
            r.unit,
            r.end_date ?? "",
            r.accession_number ?? "",
            r.frame ?? "",
          ].join("|") === key
      );
      const row = { ...fact, processing_run_id: processingRunId };
      if (idx >= 0) this.rows[idx] = row;
      else this.rows.push(row);
    }
    return facts.length;
  }

  async listByCompany(companyKey: string) {
    return this.rows.filter((r) => r.company_key === companyKey);
  }
}
