import type { PoolClient } from "pg";
import type { CompaniesRepository } from "./companies-repository.js";
import type { SourcePayloadsRepository } from "./source-payloads-repository.js";
import type { FinancialFactsRepository } from "./financial-facts-repository.js";
import type { NormalizedFinancialFact } from "../../normalization/normalize-financial-fact.js";

/** Postgres-backed companies repository (optional RUN_DB_TESTS path). */
export class PgCompaniesRepository implements CompaniesRepository {
  constructor(private client: PoolClient) {}

  async upsertByKey(input: {
    company_key: string;
    legal_name: string;
    display_name: string;
    cik: string | null;
    country_of_domicile?: string | null;
    website?: string | null;
  }) {
    const result = await this.client.query<{ id: string; company_key: string }>(
      `INSERT INTO companies (company_key, legal_name, display_name, cik)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_key) DO UPDATE
         SET legal_name = EXCLUDED.legal_name,
             display_name = EXCLUDED.display_name,
             cik = EXCLUDED.cik,
             updated_at = now()
       RETURNING id, company_key`,
      [input.company_key, input.legal_name, input.display_name, input.cik]
    );
    return result.rows[0];
  }

  async findByKey(companyKey: string) {
    const result = await this.client.query<{ id: string; company_key: string }>(
      `SELECT id, company_key FROM companies WHERE company_key = $1`,
      [companyKey]
    );
    return result.rows[0] ?? null;
  }
}

export class PgSourcePayloadsRepository implements SourcePayloadsRepository {
  constructor(private client: PoolClient) {}

  async insertIfNew(input: {
    source_type: string;
    source_identifier: string;
    company_key: string;
    cik: string | null;
    content_hash: string;
    storage_uri: string;
    original_uri: string;
    content_type: string;
    byte_size: number;
  }) {
    const result = await this.client.query(
      `INSERT INTO source_payloads (
         source_type, source_identifier, company_key, cik, content_hash,
         storage_uri, original_uri, content_type, byte_size
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (source_type, source_identifier, content_hash) DO NOTHING
       RETURNING id`,
      [
        input.source_type,
        input.source_identifier,
        input.company_key,
        input.cik,
        input.content_hash,
        input.storage_uri,
        input.original_uri,
        input.content_type,
        input.byte_size,
      ]
    );
    return { inserted: (result.rowCount ?? 0) > 0 };
  }
}

export class PgFinancialFactsRepository implements FinancialFactsRepository {
  constructor(private client: PoolClient) {}

  async upsertMany(
    facts: Array<NormalizedFinancialFact & { is_canonical?: boolean }>,
    processingRunId: string
  ) {
    let n = 0;
    for (const fact of facts) {
      const result = await this.client.query(
        `INSERT INTO financial_facts (
           company_key, concept, taxonomy_namespace, original_label,
           normalized_metric, value_numeric, unit, start_date, end_date,
           filing_date, accession_number, fiscal_year, fiscal_period, form,
           frame, is_segment, is_canonical, data_quality_status, metadata
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10::date,$11,$12,$13,$14,$15,$16,$17,$18,
           jsonb_build_object('processing_run_id', $19::text)
         )
         ON CONFLICT DO NOTHING`,
        [
          fact.company_key,
          fact.concept,
          fact.taxonomy_namespace,
          fact.original_label,
          fact.normalized_metric,
          fact.value_numeric,
          fact.unit,
          fact.start_date,
          fact.end_date,
          fact.filing_date,
          fact.accession_number,
          fact.fiscal_year,
          fact.fiscal_period,
          fact.form,
          fact.frame,
          fact.is_segment,
          Boolean(fact.is_canonical),
          fact.data_quality_status,
          processingRunId,
        ]
      );
      if ((result.rowCount ?? 0) > 0) n++;
    }
    return n;
  }

  async listByCompany(companyKey: string) {
    const result = await this.client.query(
      `SELECT company_key, concept, taxonomy_namespace, original_label,
              normalized_metric, value_numeric, unit, start_date, end_date,
              filing_date, accession_number, fiscal_year, fiscal_period, form,
              frame, is_segment, data_quality_status
       FROM financial_facts WHERE company_key = $1`,
      [companyKey]
    );
    return result.rows.map((r) => ({
      company_key: r.company_key,
      concept: r.concept,
      taxonomy_namespace: r.taxonomy_namespace,
      original_label: r.original_label,
      normalized_metric: r.normalized_metric,
      value_numeric: Number(r.value_numeric),
      unit: r.unit,
      start_date: r.start_date,
      end_date: r.end_date,
      filing_date: r.filing_date,
      accession_number: r.accession_number,
      fiscal_year: r.fiscal_year,
      fiscal_period: r.fiscal_period,
      form: r.form,
      frame: r.frame,
      is_segment: r.is_segment,
      data_quality_status: r.data_quality_status,
    })) as NormalizedFinancialFact[];
  }
}
