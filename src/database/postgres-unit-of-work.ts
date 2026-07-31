import type { Pool, PoolClient } from "pg";
import {
  PgCompaniesRepository,
  PgFinancialFactsRepository,
  PgSourcePayloadsRepository,
} from "./repositories/pg-repositories.js";
import type { PipelineUnitOfWork } from "./unit-of-work.js";
import type { FilingSectionsRepository } from "./repositories/filing-sections-repository.js";
import type { EvidenceCandidatesRepository } from "./repositories/evidence-candidates-repository.js";
import type { IdentifierResolutionsRepository } from "./repositories/identifier-resolutions-repository.js";
import type { ClassificationsRepository } from "./repositories/classifications-repository.js";
import type { PeerRelationshipsRepository } from "./repositories/peer-relationships-repository.js";
import type { ReviewItemsRepository } from "./repositories/review-items-repository.js";
import type { FilingSection } from "../normalization/extract-filing-sections.js";
import type { EvidenceCandidate } from "../evidence/extract-evidence-candidates.js";
import type { ResolvedCompanyIdentifiers } from "../sources/types.js";
import type {
  ClassificationResult,
  PeerRelationshipResult,
  ReviewItem,
} from "../domain/types.js";

const AGG = "_all_";

class PgFilingSectionsRepository implements FilingSectionsRepository {
  constructor(
    private client: PoolClient,
    private runKey: string
  ) {}

  async replaceForCompany(
    companyKey: string,
    sections: FilingSection[],
    _processingRunId: string
  ) {
    await this.client.query(
      `INSERT INTO pipeline_stage_payloads (processing_run_key, stage, company_key, payload)
       VALUES ($1, 'filing_sections', $2, $3::jsonb)
       ON CONFLICT (processing_run_key, stage, company_key)
       DO UPDATE SET payload = EXCLUDED.payload`,
      [this.runKey, companyKey, JSON.stringify(sections)]
    );
    return sections.length;
  }

  async listByCompany(companyKey: string) {
    const result = await this.client.query<{ payload: FilingSection[] }>(
      `SELECT payload FROM pipeline_stage_payloads
       WHERE processing_run_key = $1 AND stage = 'filing_sections' AND company_key = $2`,
      [this.runKey, companyKey]
    );
    return result.rows[0]?.payload ?? [];
  }
}

class PgEvidenceCandidatesRepository implements EvidenceCandidatesRepository {
  constructor(
    private client: PoolClient,
    private runKey: string
  ) {}

  async replaceForCompany(
    companyKey: string,
    candidates: EvidenceCandidate[],
    _processingRunId: string
  ) {
    await this.client.query(
      `INSERT INTO pipeline_stage_payloads (processing_run_key, stage, company_key, payload)
       VALUES ($1, 'evidence_candidates', $2, $3::jsonb)
       ON CONFLICT (processing_run_key, stage, company_key)
       DO UPDATE SET payload = EXCLUDED.payload`,
      [this.runKey, companyKey, JSON.stringify(candidates)]
    );
    return candidates.length;
  }

  async listByCompany(companyKey: string) {
    const result = await this.client.query<{ payload: EvidenceCandidate[] }>(
      `SELECT payload FROM pipeline_stage_payloads
       WHERE processing_run_key = $1 AND stage = 'evidence_candidates' AND company_key = $2`,
      [this.runKey, companyKey]
    );
    return result.rows[0]?.payload ?? [];
  }
}

class PgIdentifierResolutionsRepository
  implements IdentifierResolutionsRepository
{
  constructor(
    private client: PoolClient,
    private runKey: string
  ) {}

  async upsert(resolution: ResolvedCompanyIdentifiers, _processingRunId: string) {
    await this.client.query(
      `INSERT INTO pipeline_stage_payloads (processing_run_key, stage, company_key, payload)
       VALUES ($1, 'identifier_resolution', $2, $3::jsonb)
       ON CONFLICT (processing_run_key, stage, company_key)
       DO UPDATE SET payload = EXCLUDED.payload`,
      [this.runKey, resolution.company_key, JSON.stringify(resolution)]
    );
  }

  async list(_processingRunId: string) {
    const result = await this.client.query<{
      payload: ResolvedCompanyIdentifiers;
    }>(
      `SELECT payload FROM pipeline_stage_payloads
       WHERE processing_run_key = $1 AND stage = 'identifier_resolution'`,
      [this.runKey]
    );
    return result.rows.map((r) => r.payload);
  }
}

class PgClassificationsRepository implements ClassificationsRepository {
  constructor(
    private client: PoolClient,
    private runKey: string
  ) {}

  async replaceAll(
    classifications: ClassificationResult[],
    _processingRunId: string
  ) {
    await this.client.query(
      `INSERT INTO pipeline_stage_payloads (processing_run_key, stage, company_key, payload)
       VALUES ($1, 'classifications', $2, $3::jsonb)
       ON CONFLICT (processing_run_key, stage, company_key)
       DO UPDATE SET payload = EXCLUDED.payload`,
      [this.runKey, AGG, JSON.stringify(classifications)]
    );
    return classifications.length;
  }

  async list(_processingRunId: string) {
    const result = await this.client.query<{ payload: ClassificationResult[] }>(
      `SELECT payload FROM pipeline_stage_payloads
       WHERE processing_run_key = $1 AND stage = 'classifications' AND company_key = $2`,
      [this.runKey, AGG]
    );
    return result.rows[0]?.payload ?? [];
  }
}

class PgPeerRelationshipsRepository implements PeerRelationshipsRepository {
  constructor(
    private client: PoolClient,
    private runKey: string
  ) {}

  async replaceAll(peers: PeerRelationshipResult[], _processingRunId: string) {
    await this.client.query(
      `INSERT INTO pipeline_stage_payloads (processing_run_key, stage, company_key, payload)
       VALUES ($1, 'peer_relationships', $2, $3::jsonb)
       ON CONFLICT (processing_run_key, stage, company_key)
       DO UPDATE SET payload = EXCLUDED.payload`,
      [this.runKey, AGG, JSON.stringify(peers)]
    );
    return peers.length;
  }

  async list(_processingRunId: string) {
    const result = await this.client.query<{
      payload: PeerRelationshipResult[];
    }>(
      `SELECT payload FROM pipeline_stage_payloads
       WHERE processing_run_key = $1 AND stage = 'peer_relationships' AND company_key = $2`,
      [this.runKey, AGG]
    );
    return result.rows[0]?.payload ?? [];
  }
}

class PgReviewItemsRepository implements ReviewItemsRepository {
  constructor(
    private client: PoolClient,
    private runKey: string
  ) {}

  async replaceAll(items: ReviewItem[], _processingRunId: string) {
    await this.client.query(
      `INSERT INTO pipeline_stage_payloads (processing_run_key, stage, company_key, payload)
       VALUES ($1, 'review_items', $2, $3::jsonb)
       ON CONFLICT (processing_run_key, stage, company_key)
       DO UPDATE SET payload = EXCLUDED.payload`,
      [this.runKey, AGG, JSON.stringify(items)]
    );
    return items.length;
  }

  async list(_processingRunId: string) {
    const result = await this.client.query<{ payload: ReviewItem[] }>(
      `SELECT payload FROM pipeline_stage_payloads
       WHERE processing_run_key = $1 AND stage = 'review_items' AND company_key = $2`,
      [this.runKey, AGG]
    );
    return result.rows[0]?.payload ?? [];
  }
}

export async function ensurePipelineRunRecord(
  client: PoolClient,
  processingRunKey: string,
  pipelineName: string
) {
  await client.query(
    `INSERT INTO pipeline_run_records (processing_run_key, pipeline_name, status)
     VALUES ($1, $2, 'running')
     ON CONFLICT (processing_run_key) DO UPDATE
       SET status = 'running', updated_at = now()`,
    [processingRunKey, pipelineName]
  );
}

export async function finalizePipelineRunRecord(
  client: PoolClient,
  processingRunKey: string,
  input: {
    status: string;
    snapshotId?: string;
    publicationStatus?: string;
    summary: Record<string, unknown>;
  }
) {
  await client.query(
    `UPDATE pipeline_run_records
     SET status = $2,
         snapshot_id = $3,
         publication_status = $4,
         summary = $5::jsonb,
         updated_at = now()
     WHERE processing_run_key = $1`,
    [
      processingRunKey,
      input.status,
      input.snapshotId ?? null,
      input.publicationStatus ?? null,
      JSON.stringify(input.summary),
    ]
  );
}

export async function persistWebsiteReadinessChecks(
  client: PoolClient,
  processingRunKey: string,
  checks: Array<{ check_code: string; passed: boolean; detail: string }>
) {
  for (const check of checks) {
    await client.query(
      `INSERT INTO website_readiness_checks (processing_run_key, check_code, passed, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (processing_run_key, check_code)
       DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail`,
      [processingRunKey, check.check_code, check.passed, check.detail]
    );
  }
}

/**
 * Build a Postgres-backed unit of work for a single processing run.
 * Requires migrations through 003_phase36_pipeline_persistence.
 */
export async function createPostgresUnitOfWork(
  pool: Pool,
  processingRunKey: string
): Promise<{ uow: PipelineUnitOfWork; client: PoolClient; release: () => void }> {
  const client = await pool.connect();
  // Long live-EDGAR runs hold this client across network waits; ignore late disconnect noise.
  client.on("error", (err) => {
    console.error(`[pg] unit-of-work client error: ${err.message}`);
  });
  await ensurePipelineRunRecord(client, processingRunKey, "phase3.6");
  const uow: PipelineUnitOfWork = {
    companies: new PgCompaniesRepository(client),
    sourcePayloads: new PgSourcePayloadsRepository(client),
    financialFacts: new PgFinancialFactsRepository(client),
    filingSections: new PgFilingSectionsRepository(client, processingRunKey),
    evidenceCandidates: new PgEvidenceCandidatesRepository(
      client,
      processingRunKey
    ),
    identifierResolutions: new PgIdentifierResolutionsRepository(
      client,
      processingRunKey
    ),
    classifications: new PgClassificationsRepository(client, processingRunKey),
    peerRelationships: new PgPeerRelationshipsRepository(
      client,
      processingRunKey
    ),
    reviewItems: new PgReviewItemsRepository(client, processingRunKey),
  };
  return {
    uow,
    client,
    release: () => client.release(),
  };
}
