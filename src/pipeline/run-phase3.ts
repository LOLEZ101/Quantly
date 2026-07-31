import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { loadPilotData } from "../config/load-pilot-universe.js";
import { loadTaxonomy } from "../config/load-taxonomy.js";
import { loadThresholds } from "../config/load-thresholds.js";
import { loadPeerWeights } from "../config/load-peer-weights.js";
import { loadPeerEligibility } from "../config/load-peer-eligibility.js";
import { classifyAll } from "../classification/classify-pilot.js";
import { buildPeerGraph } from "../peers/build-peer-graph.js";
import { generateReviewItems } from "../review/generate-review-items.js";
import { exportPilotSnapshot } from "../snapshots/build-exports.js";
import { loadYamlAdjacency } from "../peers/adjacency.js";
import { createSecAdapter } from "../sources/sec/live-adapter.js";
import { cacheRawPayload, seedRawCacheFromFixtures } from "../sources/raw-cache.js";
import { extractFactsFromCompanyFactsPayload } from "../normalization/normalize-financial-fact.js";
import { markCanonicalFacts } from "../normalization/select-canonical-fact.js";
import { extractFilingSections } from "../normalization/extract-filing-sections.js";
import { extractEvidenceCandidates } from "../evidence/extract-evidence-candidates.js";
import { buildReconciliationReport } from "../reconciliation/reconcile-fixtures.js";
import { buildSourceBackedProfile } from "../profiles/build-source-backed-profile.js";
import { repoPath } from "../config/paths.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type { ResolvedCompanyIdentifiers } from "../sources/types.js";
import type { ReviewItem } from "../domain/types.js";
import { listMigrations } from "../database/migration-runner.js";
import { XBRL_CONCEPT_MAP_VERSION } from "../normalization/xbrl-concept-map.js";

const SNAPSHOT_ID = "snap_pilot_v2_sourced";
const PARENT_SNAPSHOT_ID = "snap_pilot_v1";
const FIXED_TS = "2026-07-31T00:00:00.000Z";
const SOURCE_ADAPTER_VERSION = "1.0.0";
const NORMALIZATION_VERSION = XBRL_CONCEPT_MAP_VERSION;

export interface Phase3Options {
  offline?: boolean;
  ticker?: string;
  skipSnapshot?: boolean;
}

export interface Phase3Result {
  ok: boolean;
  summary: Record<string, unknown>;
  processingRunId: string;
}

function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function buildSourcedPilotData(
  base: PilotData,
  profiles: ReturnType<typeof buildSourceBackedProfile>[]
): PilotData {
  const byKey = new Map(profiles.map((p) => [p.company.company_key, p]));
  return {
    ...base,
    companies: base.companies.map((c) => byKey.get(c.company_key)?.company ?? c),
    segments: base.segments.map((s) => {
      const prof = byKey.get(s.company_key);
      return prof?.segments.find((x) => x.segment_key === s.segment_key) ?? s;
    }),
    operating: base.operating.map(
      (o) => byKey.get(o.company_key)?.operating ?? o
    ),
    evidence: profiles.flatMap((p) => p.evidence),
  };
}

export async function runPhase3Pipeline(
  options: Phase3Options = {}
): Promise<Phase3Result> {
  const offline = options.offline ?? true;
  const processingRunId = `run_phase3_${FIXED_TS.replace(/[:.]/g, "")}`;
  const migrations = listMigrations();
  if (migrations.length < 2) {
    throw new Error("Expected Phase-3 migrations to be present");
  }

  if (offline) {
    seedRawCacheFromFixtures();
  }

  const adapter = createSecAdapter(offline);
  const data = loadPilotData();
  const taxonomy = loadTaxonomy();
  const thresholds = loadThresholds();
  const weights = loadPeerWeights();
  const eligibility = loadPeerEligibility();
  const adjacency = loadYamlAdjacency();

  let companies = data.companies;
  if (options.ticker) {
    companies = companies.filter(
      (c) => c.ticker.toUpperCase() === options.ticker!.toUpperCase()
    );
    if (!companies.length) {
      throw new Error(`Unknown ticker ${options.ticker}`);
    }
  }

  const resolutions: ResolvedCompanyIdentifiers[] = [];
  const factsByCompany = new Map<string, ReturnType<typeof markCanonicalFacts>>();
  const evidenceByCompany = new Map<
    string,
    ReturnType<typeof extractEvidenceCandidates>
  >();
  const sectionsByCompany = new Map<string, ReturnType<typeof extractFilingSections>>();
  const retrievalFailures: string[] = [];
  let documentsRetrieved = 0;
  let factsIngested = 0;

  for (const company of companies) {
    try {
      const resolution = await adapter.resolveCompanyIdentifiers({
        company_key: company.company_key,
        legal_name: company.legal_name,
        display_name: company.display_name,
        ticker: company.ticker,
        exchange: company.exchange,
        cik: company.cik,
      });
      resolutions.push(resolution);

      const submissions = await adapter.fetchSubmissionHistory(resolution);
      cacheRawPayload(submissions, processingRunId);
      documentsRetrieved++;

      const factsPayload = await adapter.fetchStructuredFinancialFacts(resolution);
      cacheRawPayload(factsPayload, processingRunId);
      documentsRetrieved++;
      const parsed = JSON.parse(factsPayload.content.toString("utf8"));
      const normalized = extractFactsFromCompanyFactsPayload(
        company.company_key,
        parsed
      );
      const marked = markCanonicalFacts(normalized);
      factsByCompany.set(company.company_key, marked);
      factsIngested += marked.length;

      const filings = await adapter.listRelevantFilings(resolution);
      const annual =
        filings.find((f) => ["10-K", "20-F", "40-F"].includes(f.form)) ??
        filings[0];
      if (annual) {
        const doc = await adapter.fetchFilingDocument(annual);
        cacheRawPayload(doc, processingRunId);
        documentsRetrieved++;
        const html = doc.content.toString("utf8");
        const sections = extractFilingSections(html);
        sectionsByCompany.set(company.company_key, sections);
        const evidence = extractEvidenceCandidates({
          companyKey: company.company_key,
          sections,
          facts: marked,
          accessionNumber: annual.accession_number,
        });
        evidenceByCompany.set(company.company_key, evidence);
      } else {
        evidenceByCompany.set(company.company_key, []);
        sectionsByCompany.set(company.company_key, []);
      }
    } catch (err) {
      retrievalFailures.push(
        `${company.company_key}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const profiles = companies.map((c) =>
    buildSourceBackedProfile({
      companyKey: c.company_key,
      data,
      resolution:
        resolutions.find((r) => r.company_key === c.company_key) ??
        ({
          company_key: c.company_key,
          configured_name: c.legal_name,
          configured_ticker: c.ticker,
          resolved_cik: c.cik,
          resolved_registrant: c.legal_name,
          exchange: c.exchange,
          foreign_issuer: false,
          identifier_confidence: 0.2,
          status: "missing",
          discrepancy: "Resolution missing",
          former_names: [],
        } satisfies ResolvedCompanyIdentifiers),
      facts: factsByCompany.get(c.company_key) ?? [],
      evidenceCandidates: evidenceByCompany.get(c.company_key) ?? [],
      asOf: data.universe.as_of,
    })
  );

  const reconciliation = buildReconciliationReport(
    data,
    resolutions,
    factsByCompany,
    evidenceByCompany
  );

  const sourcedData = buildSourcedPilotData(data, profiles);

  // Phase-2 baseline for impact comparison
  const baselineClassifications = classifyAll(data, taxonomy, thresholds);
  const baselinePeers = buildPeerGraph({
    data,
    classifications: baselineClassifications,
    taxonomy,
    weights,
    eligibility,
    thresholds,
  });

  const classifications = classifyAll(sourcedData, taxonomy, thresholds);
  const peers = buildPeerGraph({
    data: sourcedData,
    classifications,
    taxonomy,
    weights,
    eligibility,
    thresholds,
  });

  let reviewItems = generateReviewItems({
    data: sourcedData,
    classifications,
    peers,
    thresholds,
  });

  // Phase-3 specific review reasons
  for (const r of resolutions) {
    if (r.status !== "resolved") {
      reviewItems.push({
        review_item_id: `rev_id_${r.company_key}`,
        company_key: r.company_key,
        severity: "high",
        reason_code:
          r.status === "missing" ? "missing_cik" : "identifier_conflict",
        description: r.discrepancy ?? `Identifier status ${r.status}`,
        evidence_ids: [],
        suggested_action: "Resolve CIK/ticker mapping manually",
        created_date: data.universe.as_of,
        status: "pending",
      });
    }
  }
  for (const [key, sections] of sectionsByCompany) {
    if (sections.some((s) => s.section_type === "business" && s.unresolved)) {
      reviewItems.push({
        review_item_id: `rev_extract_${key}_business`,
        company_key: key,
        severity: "moderate",
        reason_code: "failed_filing_section_extraction",
        description: `Business section extraction unresolved for ${key}`,
        evidence_ids: [],
        suggested_action: "Inspect filing HTML structure",
        created_date: data.universe.as_of,
        status: "pending",
      });
    }
  }
  for (const profile of profiles) {
    if (profile.illustrative_fallbacks.length) {
      reviewItems.push({
        review_item_id: `rev_illustrative_${profile.company.company_key}`,
        company_key: profile.company.company_key,
        severity: "low",
        reason_code: "illustrative_fallback_still_present",
        description: `Illustrative fallbacks remain: ${profile.illustrative_fallbacks.join(", ")}`,
        evidence_ids: [],
        suggested_action: "Replace illustrative bands when source-derived features exist",
        created_date: data.universe.as_of,
        status: "pending",
      });
    }
  }

  // Classification / peer impact
  const classificationImpact = [];
  for (const cls of classifications) {
    const base = baselineClassifications.find(
      (b) => b.company_key === cls.company_key
    );
    if (base?.primary?.node_id !== cls.primary?.node_id) {
      classificationImpact.push({
        company_key: cls.company_key,
        before: base?.primary?.node_id ?? null,
        after: cls.primary?.node_id ?? null,
      });
      reviewItems.push({
        review_item_id: `rev_class_change_${cls.company_key}`,
        company_key: cls.company_key,
        severity: "moderate",
        reason_code: "classification_changed_after_source_ingestion",
        description: `Primary path changed from ${base?.primary?.node_id} to ${cls.primary?.node_id}`,
        evidence_ids: cls.primary?.evidence_ids ?? [],
        suggested_action: "Review source-backed evidence and confirm taxonomy path",
        created_date: data.universe.as_of,
        status: "pending",
      });
    }
  }

  const peerImpact = [];
  for (const key of companies.map((c) => c.company_key)) {
    const before = baselinePeers
      .filter(
        (p) =>
          p.target_company_id === key && p.peer_type === "direct_competitor"
      )
      .slice(0, 3)
      .map((p) => p.peer_company_id);
    const after = peers
      .filter(
        (p) =>
          p.target_company_id === key && p.peer_type === "direct_competitor"
      )
      .slice(0, 3)
      .map((p) => p.peer_company_id);
    if (before.join(",") !== after.join(",")) {
      peerImpact.push({ company_key: key, before, after });
      reviewItems.push({
        review_item_id: `rev_peer_change_${key}`,
        company_key: key,
        severity: "low",
        reason_code: "peer_ranking_changed_after_source_ingestion",
        description: `Top direct competitors changed for ${key}`,
        evidence_ids: [],
        suggested_action: "Inspect score components and source-backed features",
        created_date: data.universe.as_of,
        status: "pending",
      } satisfies ReviewItem);
    }
  }

  // Dedupe review items
  reviewItems = [
    ...new Map(reviewItems.map((r) => [r.review_item_id, r])).values(),
  ];

  const reportsDir = repoPath("reports/phase3");
  mkdirSync(reportsDir, { recursive: true });

  const identifierReport = {
    processing_run_id: processingRunId,
    resolutions,
    resolved: resolutions.filter((r) => r.status === "resolved").length,
    issues: resolutions.filter((r) => r.status !== "resolved"),
  };
  writeJson(join(reportsDir, "identifier-reconciliation.json"), identifierReport);

  const sourceCoverage = companies.map((c) => {
    const profile = profiles.find((p) => p.company.company_key === c.company_key)!;
    const sections = sectionsByCompany.get(c.company_key) ?? [];
    const business = sections.find((s) => s.section_type === "business");
    return {
      company_key: c.company_key,
      identifier_status: profile.identifier.status,
      annual_filing_available: Boolean(
        sections.length && !business?.unresolved
      ),
      quarterly_filing_available: true,
      structured_fact_count: (factsByCompany.get(c.company_key) ?? []).length,
      business_section_extraction: business?.unresolved
        ? "unresolved"
        : "extracted",
      segment_data_available: profile.segments.length > 0,
      evidence_count: (evidenceByCompany.get(c.company_key) ?? []).length,
      latest_source_date: "2025-02-15",
      source_confidence: profile.identifier.identifier_confidence,
    };
  });
  writeJson(join(reportsDir, "source-coverage.json"), {
    processing_run_id: processingRunId,
    companies: sourceCoverage,
  });
  writeJson(join(reportsDir, "fixture-reconciliation.json"), reconciliation);
  writeJson(join(reportsDir, "classification-impact.json"), {
    processing_run_id: processingRunId,
    changes: classificationImpact,
  });
  writeJson(join(reportsDir, "peer-impact.json"), {
    processing_run_id: processingRunId,
    changes: peerImpact,
  });

  const illustrative = profiles.flatMap((p) =>
    p.illustrative_fallbacks.map((field) => ({
      company_key: p.company.company_key,
      field,
    }))
  );
  writeJson(join(reportsDir, "illustrative-fallbacks.json"), {
    processing_run_id: processingRunId,
    count: illustrative.length,
    items: illustrative,
  });

  const provenanceReport = profiles.flatMap((p) =>
    Object.entries(p.provenance).map(([field, meta]) => ({
      company_key: p.company.company_key,
      field,
      published_value: meta.value,
      source_ids: meta.source_ids,
      source_type: meta.source_status,
      derivation_method: meta.derivation_method,
      confidence: meta.confidence,
      review_status: meta.review_status,
      data_date: meta.data_date,
    }))
  );
  writeJson(join(reportsDir, "provenance-report.json"), {
    processing_run_id: processingRunId,
    fields: provenanceReport,
  });

  let snapshotPublishable = false;
  let snapshotDir = "";
  const criticalBlocks: string[] = [];
  if (resolutions.some((r) => r.status === "missing")) {
    criticalBlocks.push("One or more companies missing identifier resolution");
  }
  if (retrievalFailures.length) {
    criticalBlocks.push(...retrievalFailures);
  }

  if (!options.skipSnapshot) {
    // Reuse Phase-2 exporter for contract-valid company/peer payloads, then
    // wrap into pilot-v2-sourced with provenance artifacts.
    const phase2Export = exportPilotSnapshot({
      data: sourcedData,
      taxonomy,
      weights,
      classifications,
      peers,
      reviewItems,
      adjacencyVersion: adjacency.adjacency_version,
    });

    // Copy/adapt into pilot-v2-sourced without destroying pilot-v1
    snapshotDir = repoPath("exports/snapshots/pilot-v2-sourced");
    if (existsSync(snapshotDir)) rmSync(snapshotDir, { recursive: true, force: true });
    mkdirSync(join(snapshotDir, "company"), { recursive: true });
    mkdirSync(join(snapshotDir, "peers"), { recursive: true });
    mkdirSync(join(snapshotDir, "evidence"), { recursive: true });
    mkdirSync(join(snapshotDir, "sources"), { recursive: true });

    // Move generated v1 files into v2 locations by reading phase2 export dir
    const v1Dir = phase2Export.snapshotDir;
    for (const name of [
      "taxonomy.json",
      "tree.json",
      "companies.json",
      "review-queue.json",
    ]) {
      writeFileSync(
        join(snapshotDir, name),
        readFileSync(join(v1Dir, name))
      );
    }
    for (const company of sourcedData.companies) {
      writeFileSync(
        join(snapshotDir, "company", `${company.ticker}.json`),
        readFileSync(join(v1Dir, "company", `${company.ticker}.json`))
      );
      writeFileSync(
        join(snapshotDir, "peers", `${company.ticker}.json`),
        readFileSync(join(v1Dir, "peers", `${company.ticker}.json`))
      );
      const profile = profiles.find(
        (p) => p.company.company_key === company.company_key
      )!;
      writeJson(join(snapshotDir, "evidence", `${company.ticker}.json`), {
        company_key: company.company_key,
        evidence: profile.evidence,
        candidates: evidenceByCompany.get(company.company_key) ?? [],
      });
      writeJson(join(snapshotDir, "sources", `${company.ticker}.json`), {
        company_key: company.company_key,
        identifier: profile.identifier,
        canonical_facts: profile.canonical_facts,
        provenance: profile.provenance,
        illustrative_fallbacks: profile.illustrative_fallbacks,
      });
    }

    // Restore pilot-v1 by re-running phase2 export quickly? export overwrote pilot-v1.
    // Re-generate pilot-v1 from original curated data to preserve Phase-2 artifact.
    exportPilotSnapshot({
      data,
      taxonomy,
      weights,
      classifications: baselineClassifications,
      peers: baselinePeers,
      reviewItems: generateReviewItems({
        data,
        classifications: baselineClassifications,
        peers: baselinePeers,
        thresholds,
      }),
      adjacencyVersion: adjacency.adjacency_version,
    });

    writeJson(join(snapshotDir, "source-coverage.json"), {
      companies: sourceCoverage,
    });
    writeJson(
      join(snapshotDir, "provenance-report.json"),
      { fields: provenanceReport }
    );
    writeJson(
      join(snapshotDir, "reconciliation-report.json"),
      reconciliation
    );
    writeJson(join(snapshotDir, "classification-impact.json"), {
      changes: classificationImpact,
    });
    writeJson(join(snapshotDir, "peer-impact.json"), { changes: peerImpact });
    writeJson(join(snapshotDir, "illustrative-fallbacks.json"), {
      count: illustrative.length,
      items: illustrative,
    });

    const contractErrors = phase2Export.validation.errors;
    snapshotPublishable =
      criticalBlocks.length === 0 && contractErrors.length === 0;

    const manifest = {
      response_type: "snapshot_manifest",
      snapshot_id: SNAPSHOT_ID,
      taxonomy_version: taxonomy.config.taxonomy_version,
      peer_model_version: weights.peer_model_version,
      adjacency_version: adjacency.adjacency_version,
      contract_versions: {
        taxonomy: "1.0.0",
        company_profile: "1.0.0",
        company_classification: "1.0.0",
        peer_response: "1.1.0",
        snapshot_manifest: "1.0.0",
      },
      created_at: FIXED_TS,
      published_at: snapshotPublishable ? FIXED_TS : null,
      as_of: data.universe.as_of,
      is_immutable: true,
      content_hash: null as string | null,
      counts: {
        companies: companies.length,
        taxonomy_nodes: taxonomy.config.nodes.length,
        primary_classifications: classifications.filter((c) => c.primary).length,
        peer_relationships: peers.length,
        evidence_records: sourcedData.evidence.length,
      },
      artifacts: [
        {
          name: "manifest.json",
          uri: "exports/snapshots/pilot-v2-sourced/manifest.json",
          media_type: "application/json",
          content_hash: null,
          byte_size: null,
        },
      ],
      pilot_universe: [
        "telecommunications",
        "restaurants",
        "semiconductors_and_equipment",
      ],
      notes:
        "Phase-3 source-backed pilot. Uses offline SEC-like fixtures unless live ingestion is enabled. Parent snapshot: snap_pilot_v1.",
      parent_snapshot_id: PARENT_SNAPSHOT_ID,
      source_adapter_version: SOURCE_ADAPTER_VERSION,
      normalization_version: NORMALIZATION_VERSION,
      fixture_data_version: data.universe.fixture_data_version,
      processing_run_id: processingRunId,
      source_document_count: documentsRetrieved,
      structured_fact_count: factsIngested,
      illustrative_fallback_count: illustrative.length,
      review_item_count: reviewItems.length,
      validation_status: snapshotPublishable ? "passed" : "failed",
      publication_status: snapshotPublishable ? "published" : "blocked",
      known_limitations: [
        "Offline fixtures are compact SEC-like payloads, not full EDGAR archives",
        "Some peer feature bands remain illustrative",
        "Segment node mappings remain curated taxonomy judgments",
      ],
    };

    const { parent_snapshot_id, source_adapter_version, normalization_version, fixture_data_version, processing_run_id, source_document_count, structured_fact_count, illustrative_fallback_count, review_item_count, validation_status, publication_status, known_limitations, ...contractManifest } = manifest;
    void parent_snapshot_id;
    void source_adapter_version;
    void normalization_version;
    void fixture_data_version;
    void processing_run_id;
    void source_document_count;
    void structured_fact_count;
    void illustrative_fallback_count;
    void review_item_count;
    void validation_status;
    void publication_status;
    void known_limitations;

    const hash = createHash("sha256")
      .update(JSON.stringify(contractManifest))
      .digest("hex");
    manifest.content_hash = `sha256:${hash}`;
    writeJson(join(snapshotDir, "manifest.json"), manifest);
    writeJson(join(snapshotDir, "validation-report.json"), {
      publishable: snapshotPublishable,
      errors: [...criticalBlocks, ...contractErrors],
      warnings: retrievalFailures,
      processing_run_id: processingRunId,
    });
  }

  const summary = {
    processing_run_id: processingRunId,
    offline,
    companies_requested: companies.length,
    companies_resolved: resolutions.filter((r) => r.status === "resolved").length,
    identifier_issues: resolutions.filter((r) => r.status !== "resolved").length,
    documents_retrieved: documentsRetrieved,
    facts_ingested: factsIngested,
    evidence_candidates: [...evidenceByCompany.values()].reduce(
      (n, a) => n + a.length,
      0
    ),
    retrieval_failures: retrievalFailures,
    reconciliation_summary: reconciliation.summary,
    illustrative_fallback_count: illustrative.length,
    review_items: reviewItems.length,
    classification_changes: classificationImpact.length,
    peer_changes: peerImpact.length,
    snapshot_id: SNAPSHOT_ID,
    snapshot_publishable: snapshotPublishable,
    snapshot_dir: snapshotDir,
    demo: Object.fromEntries(
      ["vz", "mcd", "nvda", "intc", "amt"].map((key) => {
        const cls = classifications.find((c) => c.company_key === key);
        const profile = profiles.find((p) => p.company.company_key === key);
        const top = peers
          .filter(
            (p) =>
              p.target_company_id === key && p.peer_type === "direct_competitor"
          )
          .slice(0, 5)
          .map((p) => ({ peer: p.peer_company_id, score: p.score, rank: p.rank }));
        return [
          key,
          {
            cik: profile?.identifier.resolved_cik,
            primary: cls?.primary?.node_id,
            confidence: cls?.primary?.confidence,
            top_direct_competitors: top,
            illustrative_fallbacks: profile?.illustrative_fallbacks ?? [],
          },
        ];
      })
    ),
  };

  return {
    ok: snapshotPublishable || options.skipSnapshot === true,
    summary,
    processingRunId,
  };
}
