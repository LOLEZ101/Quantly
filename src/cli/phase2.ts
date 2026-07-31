#!/usr/bin/env node
import { runPhase2Pipeline } from "../pipeline/run-phase2.js";
import { validateTaxonomyConfig } from "../validation/validate-taxonomy.js";
import { loadPilotData } from "../config/load-pilot-universe.js";
import { loadThresholds } from "../config/load-thresholds.js";
import { validatePilotFixtures } from "../validation/validate-fixtures.js";
import { loadTaxonomy } from "../config/load-taxonomy.js";
import { loadPeerWeights } from "../config/load-peer-weights.js";
import { loadPeerEligibility } from "../config/load-peer-eligibility.js";
import { classifyAll } from "../classification/classify-pilot.js";
import { buildPeerGraph } from "../peers/build-peer-graph.js";
import { generateReviewItems } from "../review/generate-review-items.js";

const cmd = process.argv[2] ?? "phase2";

function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

try {
  if (cmd === "validate") {
    const taxonomyErrors = validateTaxonomyConfig();
    const data = loadPilotData();
    const thresholds = loadThresholds();
    const fixtures = validatePilotFixtures(data, thresholds);
    const ok = taxonomyErrors.length === 0 && fixtures.errors.length === 0;
    printJson({ ok, taxonomyErrors, fixtures });
    process.exit(ok ? 0 : 1);
  }

  if (cmd === "classify") {
    const taxonomy = loadTaxonomy();
    const thresholds = loadThresholds();
    const data = loadPilotData();
    const classifications = classifyAll(data, taxonomy, thresholds);
    printJson(
      classifications.map((c) => ({
        company_key: c.company_key,
        primary: c.primary?.node_id ?? null,
        reason: c.primary?.primary_selection_reason,
        confidence: c.primary?.confidence,
        secondary: c.secondary.map((s) => s.node_id),
        coverage_ratio: c.coverage_ratio,
      }))
    );
    process.exit(0);
  }

  if (cmd === "peers") {
    const taxonomy = loadTaxonomy();
    const thresholds = loadThresholds();
    const weights = loadPeerWeights();
    const eligibility = loadPeerEligibility();
    const data = loadPilotData();
    const classifications = classifyAll(data, taxonomy, thresholds);
    const peers = buildPeerGraph({
      data,
      classifications,
      taxonomy,
      weights,
      eligibility,
      thresholds,
    });
    printJson({
      count: peers.length,
      sample: peers.slice(0, 30).map((p) => ({
        target: p.target_company_id,
        peer: p.peer_company_id,
        type: p.peer_type,
        score: p.score,
        rank: p.rank,
        eligibility: p.eligibility,
      })),
    });
    process.exit(0);
  }

  if (cmd === "review") {
    const result = runPhase2Pipeline({ exportSnapshot: false });
    printJson({
      count: result.reviewItems.length,
      items: result.reviewItems.slice(0, 50),
    });
    process.exit(0);
  }

  if (cmd === "snapshot" || cmd === "phase2") {
    const result = runPhase2Pipeline({ exportSnapshot: true });
    printJson({
      ok: result.ok,
      summary: result.summary,
      snapshotDir: result.snapshot.snapshotDir,
      publishable: result.snapshot.validation.publishable,
      errorCount: result.snapshot.validation.errors.length,
      errorsPreview: result.snapshot.validation.errors.slice(0, 15),
    });
    process.exit(result.ok ? 0 : 1);
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
