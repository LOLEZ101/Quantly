import { createHash } from "node:crypto";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { TaxonomyIndex } from "../config/load-taxonomy.js";
import type { PeerWeightsConfig } from "../config/load-peer-weights.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type {
  ClassificationResult,
  PeerRelationshipResult,
  ReviewItem,
} from "../domain/types.js";
import { repoPath } from "../config/paths.js";
import {
  validateClassificationContractShape,
  validatePeerContractShape,
  validateSnapshotManifest,
} from "../validation/validate-outputs.js";

export interface SnapshotBuildResult {
  snapshotDir: string;
  manifest: Record<string, unknown>;
  validation: {
    errors: string[];
    warnings: string[];
    publishable: boolean;
  };
  counts: {
    companies: number;
    classifications: number;
    peer_relationships: number;
    review_items: number;
    evidence: number;
  };
}

const SNAPSHOT_ID = "snap_pilot_v1";
const FIXED_CREATED_AT = "2026-07-31T00:00:00.000Z";

export function exportPilotSnapshot(input: {
  data: PilotData;
  taxonomy: TaxonomyIndex;
  weights: PeerWeightsConfig;
  classifications: ClassificationResult[];
  peers: PeerRelationshipResult[];
  reviewItems: ReviewItem[];
  adjacencyVersion: string;
  /** Override default pilot-v1 output directory (relative to repo root). */
  outputRelativeDir?: string;
  snapshotId?: string;
}): SnapshotBuildResult {
  const snapshotDir = repoPath(
    input.outputRelativeDir ?? "exports/snapshots/pilot-v1"
  );
  const snapshotId = input.snapshotId ?? SNAPSHOT_ID;
  if (existsSync(snapshotDir)) {
    rmSync(snapshotDir, { recursive: true, force: true });
  }
  mkdirSync(join(snapshotDir, "company"), { recursive: true });
  mkdirSync(join(snapshotDir, "peers"), { recursive: true });

  const errors: string[] = [];
  const warnings: string[] = [];

  const taxonomyJson = {
    response_type: "taxonomy_tree",
    taxonomy_version: input.taxonomy.config.taxonomy_version,
    as_of: input.data.universe.as_of,
    root: nodePayload(input.taxonomy, "root"),
    nodes: input.taxonomy.config.nodes.map((n) =>
      nodePayload(input.taxonomy, n.id)
    ),
  };
  writeJson(join(snapshotDir, "taxonomy.json"), taxonomyJson);

  const treeJson = {
    response_type: "taxonomy_tree",
    taxonomy_version: input.taxonomy.config.taxonomy_version,
    as_of: input.data.universe.as_of,
    root: nodePayload(input.taxonomy, "root"),
    nodes: input.taxonomy.config.nodes.map((n) => ({
      id: n.id,
      parent_id: n.parent_id,
      path: n.path,
      node_type: n.node_type,
      name: n.name,
    })),
  };
  writeJson(join(snapshotDir, "tree.json"), treeJson);

  const companiesOut = input.data.companies.map((c) => {
    const cls = input.classifications.find((x) => x.company_key === c.company_key);
    return {
      company_key: c.company_key,
      display_name: c.display_name,
      ticker: c.ticker,
      sp500_membership_status: c.sp500_membership_status,
      primary_node_id: cls?.primary?.node_id ?? null,
      primary_path: cls?.primary?.path ?? null,
    };
  });
  writeJson(join(snapshotDir, "companies.json"), {
    as_of: input.data.universe.as_of,
    companies: companiesOut,
  });

  for (const company of input.data.companies) {
    const cls = input.classifications.find(
      (c) => c.company_key === company.company_key
    )!;
    const segs = input.data.segments.filter(
      (s) => s.company_key === company.company_key
    );
    const op = input.data.operating.find(
      (o) => o.company_key === company.company_key
    );
    const fin = input.data.financial.find(
      (f) => f.company_key === company.company_key
    );

    const profile = {
      response_type: "company_profile",
      taxonomy_version: input.taxonomy.config.taxonomy_version,
      as_of: input.data.universe.as_of,
      snapshot_id: snapshotId,
      company: {
        company_key: company.company_key,
        legal_name: company.legal_name,
        display_name: company.display_name,
        cik: company.cik,
        lei: null,
        country_of_domicile: company.country_of_domicile,
        description: company.primary_business_description.value,
        website: company.website,
        is_active: company.is_active,
      },
      securities: [
        {
          ticker: company.ticker,
          exchange: company.exchange,
          currency: "USD",
          security_type: "common_equity",
          isin: null,
          cusip: null,
          is_primary: true,
        },
      ],
      index_membership:
        company.sp500_membership_status === "member"
          ? [
              {
                index_code: "SPX",
                index_name: "S&P 500",
                effective_from: "2020-01-01",
                effective_to: null,
              },
            ]
          : [],
      business_segments: segs.map((s) => ({
        segment_key: s.segment_key,
        segment_name: s.segment_name,
        node_id: s.node_id,
        revenue_weight: s.reported_weight,
        confidence: 0.8,
        is_manual: s.quality === "manually_classified",
        fiscal_year: s.fiscal_year,
      })),
      customer_exposures: input.data.customers
        .filter((c) => c.company_key === company.company_key)
        .map((c) => ({
          customer_type: c.customer_type,
          weight: c.weight,
          confidence: 0.75,
          is_manual: false,
        })),
      geographic_exposures: input.data.geos
        .filter((g) => g.company_key === company.company_key)
        .map((g) => ({
          geo_code: g.geo_code,
          geo_name: g.geo_name,
          weight: g.weight,
          confidence: 0.75,
          is_manual: false,
        })),
      revenue_models: (op?.revenue_models ?? []).map((m) => ({
        model_code: m.model_code,
        model_name: m.model_name,
        weight: m.weight,
        confidence: 0.8,
        is_manual: true,
      })),
      infrastructure_models: (op?.infrastructure_models ?? []).map((m) => ({
        model_code: m.model_code,
        model_name: m.model_name,
        weight: m.weight,
        confidence: 0.8,
        is_manual: true,
        notes: m.notes ?? null,
      })),
      financial_snapshot: fin
        ? {
            as_of_date: fin.as_of,
            currency: fin.currency,
            market_cap: null,
            enterprise_value: null,
            revenue_ttm: null,
            revenue_growth_yoy: null,
            gross_margin: null,
            operating_margin: null,
            ebitda_margin: null,
            source: "illustrative_pilot_bands_only",
          }
        : null,
    };

    const classificationPayload = {
      response_type: "company_classification",
      company_key: company.company_key,
      taxonomy_version: input.taxonomy.config.taxonomy_version,
      as_of: input.data.universe.as_of,
      snapshot_id: snapshotId,
      primary_path: cls.primary
        ? {
            node_id: cls.primary.node_id,
            path: cls.primary.path,
            nodes: cls.primary.nodes,
            weight: 1,
            confidence: cls.primary.confidence,
            is_manual: cls.primary.is_manual,
            effective_from: cls.effective_date,
            effective_to: null,
          }
        : null,
      secondary_exposures: cls.secondary.map((s) => ({
        node_id: s.node_id,
        path: s.path,
        name: input.taxonomy.byId.get(s.node_id)?.name,
        weight: s.weight,
        confidence: s.confidence,
        is_manual: s.is_manual,
        effective_from: cls.effective_date,
        effective_to: null,
      })),
      evidence: input.data.evidence
        .filter((e) => e.company_key === company.company_key)
        .map((e) => ({
          evidence_type: e.evidence_type,
          summary: e.summary,
          excerpt: e.excerpt ?? null,
          locator: e.locator ?? null,
          source_document_uri: e.source_document_uri ?? null,
          confidence: e.confidence,
          is_manual: e.is_manual,
          related_node_id: e.related_node_id ?? null,
        })),
      history: [],
      manual_overrides: input.data.overrides
        .filter((o) => o.company_key === company.company_key)
        .map((o) => ({
          target_type: mapOverrideTarget(o.action),
          prior_value: cls.calculated_before_override ?? null,
          new_value: o.payload,
          rationale: o.rationale,
          created_by: o.reviewer,
          approved_by: null,
          effective_from: o.effective_from,
          effective_to: o.expires_on ?? null,
        })),
      // extension fields (ignored by strict contract via separate file)
      _pilot: {
        primary_selection_reason: cls.primary?.primary_selection_reason,
        confidence_components: cls.primary?.confidence_components,
        coverage_ratio: cls.coverage_ratio,
        unallocated_weight: cls.unallocated_weight,
      },
    };

    // Contract validation uses a copy without _pilot
    const { _pilot, ...classificationForContract } = classificationPayload;
    void _pilot;
    errors.push(
      ...validateClassificationContractShape(classificationForContract).map(
        (e) => `${company.company_key} classification: ${e}`
      )
    );

    writeJson(
      join(snapshotDir, "company", `${company.ticker}.json`),
      classificationPayload
    );

    // Peer files per company: one file containing all peer types
    const companyPeers = input.peers.filter(
      (p) => p.target_company_id === company.company_key
    );
    const byType = groupBy(companyPeers, (p) => p.peer_type);
    const peerBundle: Record<string, unknown> = {
      company_key: company.company_key,
      taxonomy_version: input.taxonomy.config.taxonomy_version,
      peer_model_version: input.weights.peer_model_version,
      as_of: input.data.universe.as_of,
      snapshot_id: snapshotId,
      peer_groups: {},
    };
    for (const [peerType, rels] of Object.entries(byType)) {
      const payload = {
        response_type: "peer_group",
        company_key: company.company_key,
        peer_type: peerType,
        taxonomy_version: input.taxonomy.config.taxonomy_version,
        peer_model_version: input.weights.peer_model_version,
        as_of: input.data.universe.as_of,
        snapshot_id: snapshotId,
        threshold:
          input.weights.peer_types[peerType]?.default_threshold ?? null,
        peers: rels.map((r) => {
          const peerCo = input.data.companies.find(
            (c) => c.company_key === r.peer_company_id
          );
          const peerCls = input.classifications.find(
            (c) => c.company_key === r.peer_company_id
          );
          return {
            company_key: r.peer_company_id,
            display_name: peerCo?.display_name ?? r.peer_company_id,
            ticker: peerCo?.ticker ?? null,
            primary_node_id: peerCls?.primary?.node_id ?? null,
            primary_path: peerCls?.primary?.path ?? null,
            score: r.score,
            rank: r.rank,
            is_manual: r.is_manual,
            components: r.components
              .filter((c) => c.configured_weight > 0)
              .map((c) => ({
                factor_code: c.factor_code,
                factor_score: c.factor_score,
                weight: c.adjusted_weight,
                weighted_contribution: c.weighted_contribution,
                notes: c.notes,
              })),
            explanation: r.explanation,
            eligibility: r.eligibility,
            candidate_reasons: r.candidate_reasons,
            confidence: r.confidence,
            incomplete: r.incomplete,
          };
        }),
      };
      // Validate contract shape without extension fields
      const contractPeers = {
        ...payload,
        peers: payload.peers.map(
          ({ explanation, eligibility, candidate_reasons, confidence, incomplete, ...rest }) => {
            void explanation;
            void eligibility;
            void candidate_reasons;
            void confidence;
            void incomplete;
            return rest;
          }
        ),
      };
      errors.push(
        ...validatePeerContractShape(contractPeers).map(
          (e) => `${company.ticker} peers ${peerType}: ${e}`
        )
      );
      (peerBundle.peer_groups as Record<string, unknown>)[peerType] = payload;
    }
    writeJson(join(snapshotDir, "peers", `${company.ticker}.json`), peerBundle);
  }

  writeJson(join(snapshotDir, "review-queue.json"), {
    as_of: input.data.universe.as_of,
    items: input.reviewItems,
  });

  const counts = {
    companies: input.data.companies.length,
    classifications: input.classifications.filter((c) => c.primary).length,
    peer_relationships: input.peers.length,
    review_items: input.reviewItems.length,
    evidence: input.data.evidence.length,
  };

  const validationReport = {
    as_of: input.data.universe.as_of,
    errors,
    warnings,
    publishable: errors.length === 0,
    counts,
  };
  writeJson(join(snapshotDir, "validation-report.json"), validationReport);

  const artifactFiles = [
    "taxonomy.json",
    "tree.json",
    "companies.json",
    "review-queue.json",
    "validation-report.json",
  ];
  const artifacts = artifactFiles.map((name) => {
    const raw = readFileSync(join(snapshotDir, name));
    return {
      name,
      uri: `${input.outputRelativeDir ?? "exports/snapshots/pilot-v1"}/${name}`,
      media_type: "application/json",
      content_hash: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
      byte_size: raw.length,
    };
  });

  const manifest = {
    response_type: "snapshot_manifest",
    snapshot_id: snapshotId,
    taxonomy_version: input.taxonomy.config.taxonomy_version,
    peer_model_version: input.weights.peer_model_version,
    adjacency_version: input.adjacencyVersion,
    contract_versions: {
      taxonomy: "1.0.0",
      company_profile: "1.0.0",
      company_classification: "1.0.0",
      peer_response: "1.1.0",
      snapshot_manifest: "1.0.0",
    },
    created_at: FIXED_CREATED_AT,
    published_at: errors.length === 0 ? FIXED_CREATED_AT : null,
    as_of: input.data.universe.as_of,
    is_immutable: true,
    content_hash: null as string | null,
    counts: {
      companies: counts.companies,
      taxonomy_nodes: input.taxonomy.config.nodes.length,
      primary_classifications: counts.classifications,
      peer_relationships: counts.peer_relationships,
      evidence_records: counts.evidence,
    },
    artifacts,
    pilot_universe: [
      "telecommunications",
      "restaurants",
      "semiconductors_and_equipment",
    ],
    notes:
      "Phase-2 manually curated pilot snapshot. Financial bands are illustrative, not live market data.",
    // extension for internal use
    snapshot_type: "pilot",
    fixture_data_version: input.data.universe.fixture_data_version,
    validation_status: errors.length === 0 ? "passed" : "failed",
    known_limitations: [
      "Manually curated fixtures",
      "Illustrative financial bands only",
      "No live SEC ingestion",
      "No AI extraction",
      "Not full S&P 500 coverage",
    ],
  };

  const { snapshot_type, fixture_data_version, validation_status, known_limitations, ...manifestContract } = manifest;
  void snapshot_type;
  void fixture_data_version;
  void validation_status;
  void known_limitations;

  const manifestErrors = validateSnapshotManifest(manifestContract);
  errors.push(...manifestErrors.map((e) => `manifest: ${e}`));
  validationReport.errors = errors;
  validationReport.publishable = errors.length === 0;
  writeJson(join(snapshotDir, "validation-report.json"), validationReport);

  if (errors.length > 0) {
    // Do not claim published
    manifest.published_at = null;
    manifest.validation_status = "failed";
  }

  const manifestBody = JSON.stringify(manifestContract, Object.keys(manifestContract).sort());
  manifest.content_hash = `sha256:${createHash("sha256").update(manifestBody).digest("hex")}`;
  writeJson(join(snapshotDir, "manifest.json"), manifest);

  return {
    snapshotDir,
    manifest,
    validation: {
      errors,
      warnings,
      publishable: errors.length === 0,
    },
    counts: {
      companies: counts.companies,
      classifications: counts.classifications,
      peer_relationships: counts.peer_relationships,
      review_items: counts.review_items,
      evidence: counts.evidence,
    },
  };
}

function nodePayload(taxonomy: TaxonomyIndex, id: string) {
  const n = taxonomy.byId.get(id)!;
  const childCount = taxonomy.config.nodes.filter((x) => x.parent_id === id).length;
  return {
    id: n.id,
    name: n.name,
    description: n.description,
    node_type: n.node_type,
    parent_id: n.parent_id,
    path: n.path!,
    depth: n.depth ?? 0,
    inclusion_criteria: n.inclusion_criteria,
    exclusion_criteria: n.exclusion_criteria,
    allowed_child_node_types: n.allowed_child_node_types,
    effective_date: n.effective_date,
    taxonomy_version: n.taxonomy_version,
    is_leaf: childCount === 0,
    child_count: childCount,
  };
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function mapOverrideTarget(
  action: string
):
  | "primary_path"
  | "secondary_exposure"
  | "segment_weight"
  | "peer_relationship"
  | "confidence"
  | "other" {
  if (action.includes("primary")) return "primary_path";
  if (action.includes("secondary")) return "secondary_exposure";
  if (action.includes("peer") || action.includes("relationship")) {
    return "peer_relationship";
  }
  return "other";
}
