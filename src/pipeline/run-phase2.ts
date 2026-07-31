import { loadPeerEligibility } from "../config/load-peer-eligibility.js";
import { loadPeerWeights } from "../config/load-peer-weights.js";
import { loadPilotData } from "../config/load-pilot-universe.js";
import { loadTaxonomy } from "../config/load-taxonomy.js";
import { loadThresholds } from "../config/load-thresholds.js";
import { classifyAll } from "../classification/classify-pilot.js";
import { buildPeerGraph } from "../peers/build-peer-graph.js";
import { generateReviewItems } from "../review/generate-review-items.js";
import { annotateOverrideMetadata } from "../review/apply-manual-overrides.js";
import { exportPilotSnapshot } from "../snapshots/build-exports.js";
import { validateTaxonomyConfig } from "../validation/validate-taxonomy.js";
import { validatePilotFixtures } from "../validation/validate-fixtures.js";
import { validatePeerScores, validateOnePrimary } from "../validation/validate-outputs.js";
import { loadYamlAdjacency } from "../peers/adjacency.js";

export interface Phase2Result {
  ok: boolean;
  summary: Record<string, unknown>;
  classifications: ReturnType<typeof classifyAll>;
  peers: ReturnType<typeof buildPeerGraph>;
  reviewItems: ReturnType<typeof generateReviewItems>;
  snapshot: ReturnType<typeof exportPilotSnapshot>;
}

export function runPhase2Pipeline(options?: {
  exportSnapshot?: boolean;
}): Phase2Result {
  const exportSnapshot = options?.exportSnapshot ?? true;
  const taxonomyErrors = validateTaxonomyConfig();
  if (taxonomyErrors.length) {
    throw new Error(`Taxonomy validation failed: ${taxonomyErrors.join("; ")}`);
  }

  const taxonomy = loadTaxonomy();
  const weights = loadPeerWeights();
  const eligibility = loadPeerEligibility();
  const thresholds = loadThresholds();
  const data = loadPilotData();
  const adjacency = loadYamlAdjacency();

  const fixtureValidation = validatePilotFixtures(data, thresholds);
  if (fixtureValidation.errors.length) {
    throw new Error(
      `Fixture validation failed:\n${fixtureValidation.errors.join("\n")}`
    );
  }

  const classifications = classifyAll(data, taxonomy, thresholds);
  const peers = buildPeerGraph({
    data,
    classifications,
    taxonomy,
    weights,
    eligibility,
    thresholds,
  });
  const reviewItems = generateReviewItems({
    data,
    classifications,
    peers,
    thresholds,
  });
  annotateOverrideMetadata({
    classifications,
    peers,
    overrides: data.overrides,
    reviewItems,
  });

  const scoreErrors = [
    ...validatePeerScores(peers),
    ...validateOnePrimary(classifications),
  ];

  let snapshot: ReturnType<typeof exportPilotSnapshot>;
  if (exportSnapshot) {
    snapshot = exportPilotSnapshot({
      data,
      taxonomy,
      weights,
      classifications,
      peers,
      reviewItems,
      adjacencyVersion: adjacency.adjacency_version,
    });
  } else {
    snapshot = {
      snapshotDir: "",
      manifest: {},
      validation: { errors: scoreErrors, warnings: fixtureValidation.warnings, publishable: scoreErrors.length === 0 },
      counts: {
        companies: data.companies.length,
        classifications: classifications.filter((c) => c.primary).length,
        peer_relationships: peers.length,
        review_items: reviewItems.length,
        evidence: data.evidence.length,
      },
    };
  }

  const ok =
    fixtureValidation.errors.length === 0 &&
    scoreErrors.length === 0 &&
    snapshot.validation.errors.length === 0;

  const summary = {
    companies: data.companies.length,
    classifications_with_primary: classifications.filter((c) => c.primary).length,
    peer_relationships: peers.length,
    review_items: reviewItems.length,
    evidence_records: data.evidence.length,
    manual_overrides: data.overrides.length,
    snapshot_publishable: snapshot.validation.publishable,
    fixture_warnings: fixtureValidation.warnings,
    validation_errors: snapshot.validation.errors.slice(0, 20),
    demo: Object.fromEntries(
      ["vz", "mcd", "nvda", "intc", "amt"].map((key) => {
        const cls = classifications.find((c) => c.company_key === key);
        const top = peers
          .filter(
            (p) =>
              p.target_company_id === key && p.peer_type === "direct_competitor"
          )
          .slice(0, 5)
          .map((p) => ({
            peer: p.peer_company_id,
            score: p.score,
            rank: p.rank,
          }));
        return [
          key,
          {
            primary: cls?.primary?.node_id ?? null,
            reason: cls?.primary?.primary_selection_reason ?? null,
            confidence: cls?.primary?.confidence ?? null,
            top_direct_competitors: top,
          },
        ];
      })
    ),
  };

  return {
    ok,
    summary,
    classifications,
    peers,
    reviewItems,
    snapshot,
  };
}
