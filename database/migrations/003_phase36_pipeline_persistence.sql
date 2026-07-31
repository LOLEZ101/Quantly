-- Phase 3.6: pipeline persistence tables for end-to-end PostgreSQL acceptance.
-- Additive; does not alter Phase-1/3 relational domain tables.

CREATE TABLE IF NOT EXISTS pipeline_run_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_key  TEXT NOT NULL UNIQUE,
  pipeline_name       TEXT NOT NULL,
  status              TEXT NOT NULL,
  snapshot_id         TEXT,
  publication_status  TEXT,
  summary             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_stage_payloads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_key  TEXT NOT NULL REFERENCES pipeline_run_records (processing_run_key)
                        ON DELETE CASCADE,
  stage               TEXT NOT NULL,
  company_key         TEXT NOT NULL DEFAULT '_all_',
  payload             JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_stage_payloads_uid UNIQUE (processing_run_key, stage, company_key)
);

CREATE INDEX IF NOT EXISTS pipeline_stage_payloads_run_idx
  ON pipeline_stage_payloads (processing_run_key, stage);

CREATE TABLE IF NOT EXISTS website_readiness_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_key  TEXT NOT NULL REFERENCES pipeline_run_records (processing_run_key)
                        ON DELETE CASCADE,
  check_code          TEXT NOT NULL,
  passed              BOOLEAN NOT NULL,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_readiness_checks_uid UNIQUE (processing_run_key, check_code)
);
