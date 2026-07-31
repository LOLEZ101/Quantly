-- Phase 3 source ingestion layer (additive; preserves Phase-1 tables)

CREATE TABLE IF NOT EXISTS schema_migrations (
  id            TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_payloads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type         TEXT NOT NULL,
  source_identifier   TEXT NOT NULL,
  company_id          UUID REFERENCES companies (id),
  company_key         TEXT,
  cik                 TEXT,
  accession_number    TEXT,
  filing_form         TEXT,
  filing_date         DATE,
  reporting_period    DATE,
  content_type        TEXT,
  content_hash        TEXT NOT NULL,
  byte_size           INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  storage_uri         TEXT NOT NULL,
  original_uri        TEXT,
  retrieval_status    TEXT NOT NULL DEFAULT 'retrieved',
  retrieved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_run_id   UUID REFERENCES processing_runs (id),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_payloads_hash_uid UNIQUE (source_type, source_identifier, content_hash)
);

CREATE INDEX IF NOT EXISTS source_payloads_company_idx ON source_payloads (company_key);
CREATE INDEX IF NOT EXISTS source_payloads_cik_idx ON source_payloads (cik);

CREATE TABLE IF NOT EXISTS financial_facts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES companies (id),
  company_key         TEXT NOT NULL,
  concept             TEXT NOT NULL,
  taxonomy_namespace  TEXT,
  original_label      TEXT,
  normalized_metric   TEXT,
  value_numeric       NUMERIC,
  value_text          TEXT,
  unit                TEXT,
  start_date          DATE,
  end_date            DATE,
  filing_date         DATE,
  accession_number    TEXT,
  fiscal_year         INTEGER,
  fiscal_period       TEXT,
  form                TEXT,
  frame               TEXT,
  is_segment          BOOLEAN NOT NULL DEFAULT FALSE,
  is_canonical        BOOLEAN NOT NULL DEFAULT FALSE,
  data_quality_status TEXT NOT NULL DEFAULT 'normalized',
  source_payload_id   UUID REFERENCES source_payloads (id),
  processing_run_id   UUID REFERENCES processing_runs (id),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_facts_dedupe_uid
  ON financial_facts (
    company_key, concept, COALESCE(unit, ''), COALESCE(end_date, '1900-01-01'),
    COALESCE(accession_number, ''), COALESCE(frame, ''), is_segment
  );

CREATE INDEX IF NOT EXISTS financial_facts_canonical_idx
  ON financial_facts (company_key, normalized_metric)
  WHERE is_canonical = TRUE;

CREATE TABLE IF NOT EXISTS financial_fact_conflicts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_key         TEXT NOT NULL,
  normalized_metric   TEXT NOT NULL,
  period_end          DATE,
  selected_fact_id    UUID REFERENCES financial_facts (id),
  contested_fact_ids  UUID[] NOT NULL DEFAULT '{}',
  reason              TEXT NOT NULL,
  processing_run_id   UUID REFERENCES processing_runs (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS filing_sections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_key         TEXT NOT NULL,
  source_document_id  UUID REFERENCES source_documents (id),
  source_payload_id   UUID REFERENCES source_payloads (id),
  section_type        TEXT NOT NULL,
  heading_text        TEXT,
  extracted_text      TEXT,
  start_offset        INTEGER,
  end_offset          INTEGER,
  extraction_confidence NUMERIC(5, 4) CHECK (
    extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)
  ),
  extraction_method   TEXT NOT NULL,
  unresolved          BOOLEAN NOT NULL DEFAULT FALSE,
  processing_run_id   UUID REFERENCES processing_runs (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        TEXT NOT NULL UNIQUE,
  company_key         TEXT NOT NULL,
  proposed_evidence_type TEXT NOT NULL,
  extracted_value     TEXT,
  extracted_text      TEXT,
  source_document_id  UUID REFERENCES source_documents (id),
  source_payload_id   UUID REFERENCES source_payloads (id),
  source_location     TEXT,
  extraction_method   TEXT NOT NULL,
  confidence          NUMERIC(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  normalization_status TEXT NOT NULL DEFAULT 'raw',
  review_status       TEXT NOT NULL DEFAULT 'pending',
  processing_run_id   UUID REFERENCES processing_runs (id),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identifier_resolutions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_key         TEXT NOT NULL,
  configured_name     TEXT NOT NULL,
  configured_ticker   TEXT NOT NULL,
  resolved_cik        TEXT,
  resolved_registrant TEXT,
  exchange            TEXT,
  foreign_issuer      BOOLEAN NOT NULL DEFAULT FALSE,
  identifier_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0
                        CHECK (identifier_confidence >= 0 AND identifier_confidence <= 1),
  status              TEXT NOT NULL,
  discrepancy         TEXT,
  processing_run_id   UUID REFERENCES processing_runs (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identifier_resolutions_company_uid UNIQUE (company_key, processing_run_id)
);

ALTER TABLE processing_runs
  ADD COLUMN IF NOT EXISTS source_adapter_version TEXT,
  ADD COLUMN IF NOT EXISTS normalization_version TEXT,
  ADD COLUMN IF NOT EXISTS companies_requested INTEGER,
  ADD COLUMN IF NOT EXISTS companies_completed INTEGER,
  ADD COLUMN IF NOT EXISTS companies_failed INTEGER,
  ADD COLUMN IF NOT EXISTS documents_retrieved INTEGER,
  ADD COLUMN IF NOT EXISTS facts_ingested INTEGER,
  ADD COLUMN IF NOT EXISTS git_commit TEXT,
  ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publication_status TEXT;
