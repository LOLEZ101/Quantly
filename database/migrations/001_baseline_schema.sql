-- Peer Engine canonical PostgreSQL schema
-- Taxonomy paths use ltree-compatible text (dotted labels).
-- Historical rows are closed via effective_to; do not overwrite closed history.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: enable if ltree operators are desired in the deployment environment
-- CREATE EXTENSION IF NOT EXISTS "ltree";

-- =============================================================================
-- Enumerations
-- =============================================================================

CREATE TYPE node_type_enum AS ENUM (
  'root',
  'sector',
  'industry_group',
  'industry',
  'sub_industry',
  'peer_cluster',
  'stub'
);

CREATE TYPE exposure_kind_enum AS ENUM (
  'primary',
  'secondary',
  'segment'
);

CREATE TYPE peer_type_enum AS ENUM (
  'economic',
  'valuation',
  'competitive',
  'custom',
  'direct_competitor',
  'operating',
  'growth',
  'risk',
  'market_behavior'
);

CREATE TYPE review_status_enum AS ENUM (
  'pending',
  'in_review',
  'approved',
  'rejected',
  'cancelled'
);

CREATE TYPE processing_status_enum AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled'
);

CREATE TYPE override_target_enum AS ENUM (
  'primary_path',
  'secondary_exposure',
  'segment_weight',
  'peer_relationship',
  'confidence',
  'other'
);

-- =============================================================================
-- Taxonomy versioning & nodes
-- =============================================================================

CREATE TABLE taxonomy_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT NOT NULL UNIQUE,
  description     TEXT,
  effective_date  DATE NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX taxonomy_versions_one_current_idx
  ON taxonomy_versions ((is_current))
  WHERE is_current = TRUE;

CREATE TABLE taxonomy_nodes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id                   TEXT NOT NULL,
  taxonomy_version_id       UUID NOT NULL REFERENCES taxonomy_versions (id),
  name                      TEXT NOT NULL,
  description               TEXT NOT NULL,
  node_type                 node_type_enum NOT NULL,
  parent_node_id            TEXT,
  path                      TEXT NOT NULL,
  depth                     INTEGER NOT NULL CHECK (depth >= 0),
  inclusion_criteria        JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusion_criteria        JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_child_node_types  JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_date            DATE NOT NULL,
  retired_at                DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT taxonomy_nodes_version_node_uid UNIQUE (taxonomy_version_id, node_id),
  CONSTRAINT taxonomy_nodes_version_path_uid UNIQUE (taxonomy_version_id, path),
  CONSTRAINT taxonomy_nodes_path_format_chk CHECK (path ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  CONSTRAINT taxonomy_nodes_root_parent_chk CHECK (
    (node_type = 'root' AND parent_node_id IS NULL) OR
    (node_type <> 'root' AND parent_node_id IS NOT NULL)
  )
);

CREATE INDEX taxonomy_nodes_parent_idx
  ON taxonomy_nodes (taxonomy_version_id, parent_node_id);

CREATE INDEX taxonomy_nodes_type_idx
  ON taxonomy_nodes (taxonomy_version_id, node_type);

CREATE INDEX taxonomy_nodes_path_idx
  ON taxonomy_nodes (taxonomy_version_id, path);

-- Self-referential FK on business node_id within the same taxonomy version
ALTER TABLE taxonomy_nodes
  ADD CONSTRAINT taxonomy_nodes_parent_fk
  FOREIGN KEY (taxonomy_version_id, parent_node_id)
  REFERENCES taxonomy_nodes (taxonomy_version_id, node_id);

-- =============================================================================
-- Companies, securities, index membership
-- =============================================================================

CREATE TABLE companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_key       TEXT NOT NULL UNIQUE,
  legal_name        TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  cik               TEXT,
  lei               TEXT,
  country_of_domicile CHAR(2),
  description       TEXT,
  website           TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX companies_cik_idx ON companies (cik) WHERE cik IS NOT NULL;
CREATE INDEX companies_lei_idx ON companies (lei) WHERE lei IS NOT NULL;

CREATE TABLE securities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies (id),
  ticker          TEXT NOT NULL,
  exchange        TEXT,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  security_type   TEXT NOT NULL DEFAULT 'common_equity',
  isin            TEXT,
  cusip           TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT securities_effective_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX securities_primary_uid
  ON securities (company_id)
  WHERE is_primary = TRUE AND effective_to IS NULL;

CREATE UNIQUE INDEX securities_ticker_exchange_active_uid
  ON securities (ticker, exchange)
  WHERE effective_to IS NULL;

CREATE INDEX securities_company_idx ON securities (company_id);

CREATE TABLE index_membership (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies (id),
  index_code      TEXT NOT NULL,
  index_name      TEXT NOT NULL,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT index_membership_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX index_membership_active_uid
  ON index_membership (company_id, index_code)
  WHERE effective_to IS NULL;

CREATE INDEX index_membership_index_idx
  ON index_membership (index_code, effective_from);

-- =============================================================================
-- Source documents & processing runs
-- =============================================================================

CREATE TABLE source_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies (id),
  document_type   TEXT NOT NULL,
  title           TEXT,
  uri             TEXT NOT NULL,
  content_hash    TEXT,
  published_at    DATE,
  retrieved_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX source_documents_company_idx ON source_documents (company_id);
CREATE INDEX source_documents_hash_idx ON source_documents (content_hash);

CREATE TABLE processing_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key             TEXT NOT NULL UNIQUE,
  pipeline_name       TEXT NOT NULL,
  taxonomy_version_id UUID REFERENCES taxonomy_versions (id),
  peer_model_version  TEXT,
  status              processing_status_enum NOT NULL DEFAULT 'queued',
  parameters          JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_hash         TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX processing_runs_status_idx ON processing_runs (status);

-- =============================================================================
-- Exposures, segments, facets
-- =============================================================================

CREATE TABLE company_node_exposures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies (id),
  taxonomy_version_id   UUID NOT NULL REFERENCES taxonomy_versions (id),
  node_id               TEXT NOT NULL,
  exposure_kind         exposure_kind_enum NOT NULL,
  weight                NUMERIC(6, 5) NOT NULL DEFAULT 1.0
                        CHECK (weight >= 0 AND weight <= 1),
  confidence            NUMERIC(5, 4) NOT NULL DEFAULT 0
                        CHECK (confidence >= 0 AND confidence <= 1),
  is_manual             BOOLEAN NOT NULL DEFAULT FALSE,
  processing_run_id     UUID REFERENCES processing_runs (id),
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_node_exposures_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT company_node_exposures_node_fk
    FOREIGN KEY (taxonomy_version_id, node_id)
    REFERENCES taxonomy_nodes (taxonomy_version_id, node_id)
);

-- At most one active primary path per company per taxonomy version
CREATE UNIQUE INDEX company_node_exposures_one_primary_uid
  ON company_node_exposures (company_id, taxonomy_version_id)
  WHERE exposure_kind = 'primary' AND effective_to IS NULL;

CREATE INDEX company_node_exposures_company_idx
  ON company_node_exposures (company_id, taxonomy_version_id);

CREATE INDEX company_node_exposures_node_idx
  ON company_node_exposures (taxonomy_version_id, node_id);

CREATE TABLE business_segments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies (id),
  taxonomy_version_id UUID REFERENCES taxonomy_versions (id),
  segment_key         TEXT NOT NULL,
  segment_name        TEXT NOT NULL,
  node_id             TEXT,
  revenue_weight      NUMERIC(6, 5) NOT NULL
                      CHECK (revenue_weight >= 0 AND revenue_weight <= 1),
  confidence          NUMERIC(5, 4) NOT NULL DEFAULT 0
                      CHECK (confidence >= 0 AND confidence <= 1),
  is_manual           BOOLEAN NOT NULL DEFAULT FALSE,
  fiscal_year         INTEGER,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_segments_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX business_segments_company_idx
  ON business_segments (company_id, effective_from);

CREATE TABLE customer_exposures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies (id),
  customer_type   TEXT NOT NULL,
  weight          NUMERIC(6, 5) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  confidence      NUMERIC(5, 4) NOT NULL DEFAULT 0
                  CHECK (confidence >= 0 AND confidence <= 1),
  is_manual       BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_exposures_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX customer_exposures_company_idx ON customer_exposures (company_id);

CREATE TABLE geographic_exposures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies (id),
  geo_code        TEXT NOT NULL,
  geo_name        TEXT NOT NULL,
  weight          NUMERIC(6, 5) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  confidence      NUMERIC(5, 4) NOT NULL DEFAULT 0
                  CHECK (confidence >= 0 AND confidence <= 1),
  is_manual       BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geographic_exposures_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX geographic_exposures_company_idx ON geographic_exposures (company_id);

CREATE TABLE revenue_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies (id),
  model_code      TEXT NOT NULL,
  model_name      TEXT NOT NULL,
  weight          NUMERIC(6, 5) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  confidence      NUMERIC(5, 4) NOT NULL DEFAULT 0
                  CHECK (confidence >= 0 AND confidence <= 1),
  is_manual       BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT revenue_models_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX revenue_models_company_idx ON revenue_models (company_id);

CREATE TABLE infrastructure_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies (id),
  model_code      TEXT NOT NULL,
  model_name      TEXT NOT NULL,
  weight          NUMERIC(6, 5) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  confidence      NUMERIC(5, 4) NOT NULL DEFAULT 0
                  CHECK (confidence >= 0 AND confidence <= 1),
  is_manual       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT infrastructure_models_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX infrastructure_models_company_idx ON infrastructure_models (company_id);

CREATE TABLE financial_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies (id),
  as_of_date          DATE NOT NULL,
  currency            CHAR(3) NOT NULL DEFAULT 'USD',
  market_cap          NUMERIC(20, 2),
  enterprise_value    NUMERIC(20, 2),
  revenue_ttm         NUMERIC(20, 2),
  revenue_growth_yoy  NUMERIC(10, 6),
  gross_margin        NUMERIC(10, 6),
  operating_margin    NUMERIC(10, 6),
  ebitda_margin       NUMERIC(10, 6),
  source              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_snapshots_company_date_uid UNIQUE (company_id, as_of_date)
);

CREATE INDEX financial_snapshots_as_of_idx ON financial_snapshots (as_of_date);

-- =============================================================================
-- Classification evidence
-- =============================================================================

CREATE TABLE classification_evidence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies (id),
  exposure_id           UUID REFERENCES company_node_exposures (id),
  source_document_id    UUID REFERENCES source_documents (id),
  evidence_type         TEXT NOT NULL,
  summary               TEXT NOT NULL,
  excerpt               TEXT,
  locator               TEXT,
  confidence            NUMERIC(5, 4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  is_manual             BOOLEAN NOT NULL DEFAULT FALSE,
  processing_run_id     UUID REFERENCES processing_runs (id),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to          DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classification_evidence_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX classification_evidence_company_idx
  ON classification_evidence (company_id);

CREATE INDEX classification_evidence_exposure_idx
  ON classification_evidence (exposure_id);

-- =============================================================================
-- Peer relationships & score components
-- =============================================================================

CREATE TABLE peer_relationships (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies (id),
  peer_company_id       UUID NOT NULL REFERENCES companies (id),
  peer_type             peer_type_enum NOT NULL,
  score                 NUMERIC(5, 4) NOT NULL CHECK (score >= 0 AND score <= 1),
  rank                  INTEGER CHECK (rank IS NULL OR rank > 0),
  taxonomy_version_id   UUID REFERENCES taxonomy_versions (id),
  peer_model_version    TEXT NOT NULL,
  is_manual             BOOLEAN NOT NULL DEFAULT FALSE,
  processing_run_id     UUID REFERENCES processing_runs (id),
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT peer_relationships_not_self_chk CHECK (company_id <> peer_company_id),
  CONSTRAINT peer_relationships_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX peer_relationships_active_uid
  ON peer_relationships (company_id, peer_company_id, peer_type, peer_model_version)
  WHERE effective_to IS NULL;

CREATE INDEX peer_relationships_company_type_idx
  ON peer_relationships (company_id, peer_type, score DESC);

CREATE TABLE peer_score_components (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_relationship_id  UUID NOT NULL REFERENCES peer_relationships (id) ON DELETE CASCADE,
  factor_code           TEXT NOT NULL,
  factor_score          NUMERIC(5, 4) NOT NULL CHECK (factor_score >= 0 AND factor_score <= 1),
  weight                NUMERIC(6, 5) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  weighted_contribution NUMERIC(6, 5) NOT NULL CHECK (
    weighted_contribution >= 0 AND weighted_contribution <= 1
  ),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT peer_score_components_uid UNIQUE (peer_relationship_id, factor_code)
);

CREATE INDEX peer_score_components_rel_idx
  ON peer_score_components (peer_relationship_id);

-- =============================================================================
-- Manual overrides & review queue
-- =============================================================================

CREATE TABLE manual_overrides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies (id),
  target_type         override_target_enum NOT NULL,
  target_id           UUID,
  taxonomy_version_id UUID REFERENCES taxonomy_versions (id),
  prior_value         JSONB,
  new_value           JSONB NOT NULL,
  rationale           TEXT NOT NULL,
  created_by          TEXT NOT NULL,
  approved_by         TEXT,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT manual_overrides_range_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX manual_overrides_company_idx
  ON manual_overrides (company_id, effective_from);

CREATE TABLE review_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies (id),
  taxonomy_version_id UUID REFERENCES taxonomy_versions (id),
  status              review_status_enum NOT NULL DEFAULT 'pending',
  priority            INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  reason              TEXT NOT NULL,
  proposed_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  assignee            TEXT,
  resolution_notes    TEXT,
  processing_run_id   UUID REFERENCES processing_runs (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX review_queue_status_idx ON review_queue (status, priority);

-- =============================================================================
-- Exported snapshots
-- =============================================================================

CREATE TABLE exported_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id           TEXT NOT NULL UNIQUE,
  taxonomy_version_id   UUID NOT NULL REFERENCES taxonomy_versions (id),
  peer_model_version    TEXT NOT NULL,
  manifest_uri          TEXT,
  artifact_uri          TEXT,
  content_hash          TEXT,
  company_count         INTEGER CHECK (company_count IS NULL OR company_count >= 0),
  published_at          TIMESTAMPTZ,
  is_immutable          BOOLEAN NOT NULL DEFAULT TRUE,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX exported_snapshots_taxonomy_idx
  ON exported_snapshots (taxonomy_version_id, published_at DESC);

-- =============================================================================
-- Integrity helpers (application-enforced; documented for classifiers)
-- =============================================================================
-- 1. Historical records: UPDATE of effective_from/weight/node on closed rows
--    (effective_to IS NOT NULL) is forbidden at the application layer.
-- 2. Every non-manual company_node_exposure must have ≥1 classification_evidence
--    row referencing it while active.
-- 3. Complete business_segments sets for a company/fiscal_year should sum
--    revenue_weight to ~1.0 (±0.01).
-- 4. Taxonomy cycles are prevented by config validation before load; DB FK
--    alone cannot catch multi-node cycles — enforce in loader tests.
