import { existsSync, readFileSync } from "node:fs";
import { repoPath } from "../config/paths.js";
import { validateSnapshotManifest } from "../validation/validate-outputs.js";
import { CORPUS_FIELD_PROVENANCE } from "../verified/corpus-field-provenance.js";

export interface ReadinessCheck {
  check_code: string;
  passed: boolean;
  detail: string;
}

const FROZEN_CONTRACTS = [
  "contracts/snapshot-manifest.schema.json",
  "contracts/company-classification.schema.json",
  "contracts/peer-response.schema.json",
  "contracts/company-profile.schema.json",
  "contracts/taxonomy.schema.json",
];

/**
 * Website / read-only API readiness checks — does not build the website.
 */
export function evaluateWebsiteReadiness(input: {
  snapshotDir: string;
  manifest: Record<string, unknown>;
  scoredPeerTypes: string[];
  gatedPeerTypes: string[];
}): { passed: boolean; checks: ReadinessCheck[] } {
  const checks: ReadinessCheck[] = [];

  for (const rel of FROZEN_CONTRACTS) {
    const ok = existsSync(repoPath(rel));
    checks.push({
      check_code: `contract_present:${rel}`,
      passed: ok,
      detail: ok ? "Contract file present" : "Missing contract file",
    });
  }

  const manifestErrors = validateSnapshotManifest({
    response_type: input.manifest.response_type,
    snapshot_id: input.manifest.snapshot_id,
    taxonomy_version: input.manifest.taxonomy_version,
    peer_model_version: input.manifest.peer_model_version,
    adjacency_version: input.manifest.adjacency_version,
    created_at: input.manifest.created_at,
    is_immutable: input.manifest.is_immutable,
    artifacts: input.manifest.artifacts,
    counts: input.manifest.counts,
    published_at: input.manifest.published_at ?? null,
    as_of: input.manifest.as_of ?? null,
    content_hash: input.manifest.content_hash ?? null,
    contract_versions: input.manifest.contract_versions,
    pilot_universe: input.manifest.pilot_universe,
    notes: input.manifest.notes ?? null,
  });
  checks.push({
    check_code: "manifest_contract_valid",
    passed: manifestErrors.length === 0,
    detail:
      manifestErrors.length === 0
        ? "Manifest validates against snapshot-manifest.schema.json"
        : manifestErrors.join("; "),
  });

  const requiredFiles = [
    "manifest.json",
    "taxonomy.json",
    "tree.json",
    "companies.json",
    "review-queue.json",
    "corpus-field-provenance.json",
    "official-source-support.json",
    "gated-peer-types.json",
    "persistence-summary.json",
  ];
  for (const name of requiredFiles) {
    const ok = existsSync(`${input.snapshotDir}/${name}`);
    checks.push({
      check_code: `artifact:${name}`,
      passed: ok,
      detail: ok ? "Present" : "Missing required readiness artifact",
    });
  }

  const sampleTickers = ["VZ", "MCD", "NVDA", "INTC", "AMT"];
  for (const ticker of sampleTickers) {
    const companyOk = existsSync(`${input.snapshotDir}/company/${ticker}.json`);
    const peersOk = existsSync(`${input.snapshotDir}/peers/${ticker}.json`);
    checks.push({
      check_code: `demo_exports:${ticker}`,
      passed: companyOk && peersOk,
      detail:
        companyOk && peersOk
          ? "company + peers exports present"
          : "Missing company/peers export for demo ticker",
    });
  }

  checks.push({
    check_code: "valuation_market_behavior_gated",
    passed:
      !input.scoredPeerTypes.includes("valuation") &&
      !input.scoredPeerTypes.includes("market_behavior") &&
      input.gatedPeerTypes.includes("valuation") &&
      input.gatedPeerTypes.includes("market_behavior"),
    detail: "Market-dependent peer types remain gated for website consumers",
  });

  checks.push({
    check_code: "corpus_field_provenance_nonempty",
    passed: CORPUS_FIELD_PROVENANCE.length >= 15,
    detail: `${CORPUS_FIELD_PROVENANCE.length} field provenance definitions`,
  });

  // Stable content-type expectations for API consumers
  try {
    const companies = JSON.parse(
      readFileSync(`${input.snapshotDir}/companies.json`, "utf8")
    );
    checks.push({
      check_code: "companies_json_parseable",
      passed: Array.isArray(companies.companies) || Array.isArray(companies),
      detail: "companies.json parseable",
    });
  } catch (err) {
    checks.push({
      check_code: "companies_json_parseable",
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

export const WEBSITE_FROZEN_CONTRACTS = FROZEN_CONTRACTS;
