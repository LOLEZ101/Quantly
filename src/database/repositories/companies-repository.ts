/** Repository interface — Postgres or in-memory implementations. */
export interface CompaniesRepository {
  upsertByKey(input: {
    company_key: string;
    legal_name: string;
    display_name: string;
    cik: string | null;
    country_of_domicile?: string | null;
    website?: string | null;
  }): Promise<{ id: string; company_key: string }>;
  findByKey(companyKey: string): Promise<{ id: string; company_key: string } | null>;
}

export class InMemoryCompaniesRepository implements CompaniesRepository {
  private rows = new Map<string, { id: string; company_key: string; legal_name: string; display_name: string; cik: string | null }>();

  async upsertByKey(input: {
    company_key: string;
    legal_name: string;
    display_name: string;
    cik: string | null;
  }) {
    const existing = this.rows.get(input.company_key);
    const id = existing?.id ?? crypto.randomUUID();
    this.rows.set(input.company_key, { id, ...input });
    return { id, company_key: input.company_key };
  }

  async findByKey(companyKey: string) {
    const row = this.rows.get(companyKey);
    return row ? { id: row.id, company_key: row.company_key } : null;
  }
}
