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
import { VERIFIED_PEER_TYPES } from "../peers/verified-peer-types.js";
import { generateReviewItems } from "../review/generate-review-items.js";
import { exportPilotSnapshot } from "../snapshots/build-exports.js";
import { loadYamlAdjacency } from "../peers/adjacency.js";
import { createSecAdapter } from "../sources/sec/live-adapter.js";
import { OfflineSecAdapter } from "../sources/sec/offline-adapter.js";
import { cacheRawPayload, seedRawCacheFromFixtures } from "../sources/raw-cache.js";
import { extractFactsFromCompanyFactsPayload } from "../normalization/normalize-financial-fact.js";
import { markCanonicalFacts } from "../normalization/select-canonical-fact.js";
import { extractFilingSections } from "../normalization/extract-filing-sections.js";
import { extractEvidenceCandidates } from "../evidence/extract-evidence-candidates.js";
import { buildSourceBackedProfile } from "../profiles/build-source-backed-profile.js";
import { deriveFinancialFeaturesFromFacts } from "../profiles/derive-financial-features.js";
import { assessOfficialSourceSupport } from "../sources/sec/assess-official-support.js";
import { buildCorpusProvenanceReport } from "../verified/corpus-field-provenance.js";
import { PROVENANCE_CLASS } from "../verified/independent-corpus.js";
import { evaluateOfficialPublication } from "../publication/official-publication.js";
import { evaluateWebsiteReadiness } from "../publication/website-readiness.js";
import {
  createInMemoryUnitOfWork,
  persistPipelineOutputs,
  persistPipelineStage,
  type PersistenceSummary,
} from "../database/unit-of-work.js";
import {
  createPostgresUnitOfWork,
  finalizePipelineRunRecord,
  persistWebsiteReadinessChecks,
} from "../database/postgres-unit-of-work.js";
import { loadEnvConfig } from "../database/env.js";
import { checkDatabaseConnectivity, closePool, getPool } from "../database/client.js";
import { listMigrations, migrate } from "../database/migration-runner.js";
import { repoPath } from "../config/paths.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type { FinancialFeaturesRecord } from "../domain/types.js";
import type { ResolvedCompanyIdentifiers } from "../sources/types.js";
import { XBRL_CONCEPT_MAP_VERSION } from "../normalization/xbrl-concept-map.js";
import { validateSnapshotManifest } from "../validation/validate-outputs.js";

const SNAPSHOT_ID = "snap_pilot_v4_official";
const PARENT_SNAPSHOT_ID = "snap_pilot_v3_verified";
const FIXED_TS = "2026-07-31T18:00:00.000Z";
const SOURCE_ADAPTER_VERSION = "1.1.0";
const NORMALIZATION_VERSION = XBRL_CONCEPT_MAP_VERSION;

export interface Phase36Options {
  offline?: boolean;
  preferPostgres?: boolean;
  ticker?: string;
  skipSnapshot?: boolean;
}

export interface Phase36Result {
  ok: boolean;
  summary: Record<string, unknown>;
  processingRunId: string;
}

function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function buildVerifiedPilotData(
  base: PilotData,
  profiles: ReturnType<typeof buildSourceBackedProfile>[],
  derivedFinancial: Map<string, FinancialFeaturesRecord>
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
    financial: base.financial.map(
      (f) => derivedFinancial.get(f.company_key) ?? f
    ),
    evidence: profiles.flatMap((p) => p.evidence),
  };
}

export async function runPhase36Pipeline(
  options: Phase36Options = {}
): Promise<Phase36Result> {
  const offline = options.offline ?? true;
  const preferPostgres = options.preferPostgres ?? true;
  const processingRunId = `run_phase36_${FIXED_TS.replace(/[:.]/g, "")}`;
  const migrations = listMigrations();
  if (migrations.length < 3) {
    throw new Error("Expected Phase-3.6 migration 003 to be present");
  }

  if (offline) {
    seedRawCacheFromFixtures("verified_independent");
  }

  const env = loadEnvConfig();
  let persistenceBackend: "memory" | "postgres" = "memory";
  let postgresE2EComplete = false;
  let pgClient: Awaited<
    ReturnType<typeof createPostgresUnitOfWork>
  > | null = null;
  let uow = createInMemoryUnitOfWork();

  if (preferPostgres && env.databaseUrl) {
    try {
      const reachable = await checkDatabaseConnectivity();
      if (reachable) {
        await migrate();
        pgClient = await createPostgresUnitOfWork(getPool(), processingRunId);
        uow = pgClient.uow;
        persistenceBackend = "postgres";
      }
    } catch {
      persistenceBackend = "memory";
      uow = createInMemoryUnitOfWork();
      pgClient = null;
    }
  }

  const adapter = createSecAdapter(offline, {
    corpus: "verified_independent",
  });
  const offlineAdapter = new OfflineSecAdapter("verified_independent");
  const provenanceClass = offlineAdapter.provenanceClass();
  const circular =
    provenanceClass !== PROVENANCE_CLASS ||
    offlineAdapter.corpusKind === "legacy_circular";

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
  }

  const resolutions: ResolvedCompanyIdentifiers[] = [];
  const factsByCompany = new Map<string, ReturnType<typeof markCanonicalFacts>>();
  const evidenceByCompany = new Map<
    string,
    ReturnType<typeof extractEvidenceCandidates>
  >();
  const sectionsByCompany = new Map<
    string,
    ReturnType<typeof extractFilingSections>
  >();
  const derivedFinancial = new Map<string, FinancialFeaturesRecord>();
  const payloadOrigins = new Map<
    string,
    { companyfactsUri: string | null }
  >();
  const liveCheckedCiks = new Set<string>();
  const retrievalFailures: string[] = [];
  let documentsRetrieved = 0;
  let factsIngested = 0;
  let payloadsPersisted = 0;

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

      const cachedPayloads = [];
      const submissions = await adapter.fetchSubmissionHistory(resolution);
      cachedPayloads.push(cacheRawPayload(submissions, processingRunId));
      documentsRetrieved++;
      if (submissions.original_uri.includes("data.sec.gov") && resolution.resolved_cik) {
        liveCheckedCiks.add(resolution.resolved_cik);
      }

      const factsPayload = await adapter.fetchStructuredFinancialFacts(resolution);
      cachedPayloads.push(cacheRawPayload(factsPayload, processingRunId));
      documentsRetrieved++;
      payloadOrigins.set(company.company_key, {
        companyfactsUri: factsPayload.original_uri,
      });
      if (factsPayload.original_uri.includes("data.sec.gov") && resolution.resolved_cik) {
        liveCheckedCiks.add(resolution.resolved_cik);
      }

      const parsed = JSON.parse(factsPayload.content.toString("utf8"));
      const normalized = extractFactsFromCompanyFactsPayload(
        company.company_key,
        parsed
      );
      const marked = markCanonicalFacts(normalized);
      factsByCompany.set(company.company_key, marked);
      factsIngested += marked.length;

      const derived = deriveFinancialFeaturesFromFacts({
        companyKey: company.company_key,
        asOf: data.universe.as_of,
        facts: marked,
      });
      if (derived) derivedFinancial.set(company.company_key, derived);

      const filings = await adapter.listRelevantFilings(resolution);
      const annual =
        filings.find((f) => ["10-K", "20-F", "40-F"].includes(f.form)) ??
        filings[0];
      let sections: ReturnType<typeof extractFilingSections> = [];
      let evidence: ReturnType<typeof extractEvidenceCandidates> = [];
      if (annual) {
        const doc = await adapter.fetchFilingDocument(annual);
        cachedPayloads.push(cacheRawPayload(doc, processingRunId));
        documentsRetrieved++;
        sections = extractFilingSections(doc.content.toString("utf8"));
        sectionsByCompany.set(company.company_key, sections);
        evidence = extractEvidenceCandidates({
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

      await persistPipelineStage({
        uow,
        processingRunId,
        company: {
          company_key: company.company_key,
          legal_name: company.legal_name,
          display_name: company.display_name,
          cik: resolution.resolved_cik,
        },
        resolution,
        cachedPayloads,
        facts: marked,
        sections,
        evidence,
      });
      payloadsPersisted += cachedPayloads.length;
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
      derivedFinancial: derivedFinancial.get(c.company_key) ?? null,
    })
  );

  const verifiedData = buildVerifiedPilotData(data, profiles, derivedFinancial);
  const classifications = classifyAll(verifiedData, taxonomy, thresholds);
  const peers = buildPeerGraph({
    data: verifiedData,
    classifications,
    taxonomy,
    weights,
    eligibility,
    thresholds,
    peerTypes: VERIFIED_PEER_TYPES,
  });

  let reviewItems = generateReviewItems({
    data: verifiedData,
    classifications,
    peers,
    thresholds,
  });
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
  reviewItems.push({
    review_item_id: "rev_market_peer_types_gated",
    company_key: companies[0]?.company_key ?? "vz",
    severity: "low",
    reason_code: "market_peer_types_unsupported",
    description:
      "valuation and market_behavior gated — no market/pricing data",
    evidence_ids: [],
    suggested_action: "Add market data before enabling those peer types",
    created_date: data.universe.as_of,
    status: "pending",
  });
  reviewItems = [
    ...new Map(reviewItems.map((r) => [r.review_item_id, r])).values(),
  ];

  const persistence: PersistenceSummary = await persistPipelineOutputs({
    uow,
    processingRunId,
    classifications,
    peers,
    reviewItems,
  });
  persistence.source_payloads_inserted = payloadsPersisted;
  persistence.facts_upserted = factsIngested;
  persistence.complete =
    persistence.complete &&
    payloadsPersisted > 0 &&
    derivedFinancial.size === companies.length;

  if (persistenceBackend === "postgres" && persistence.complete) {
    // Round-trip verify classifications landed in Postgres.
    const stored = await uow.classifications.list(processingRunId);
    postgresE2EComplete = stored.length === classifications.length;
  }

  const illustrativePeerBands = profiles.flatMap((p) =>
    p.illustrative_fallbacks.filter((f) =>
      [
        "size_band",
        "revenue_growth_band",
        "profitability_band",
        "leverage_band",
        "capital_intensity_band",
      ].includes(f)
    )
  );

  const corpusProvenance = buildCorpusProvenanceReport();
  const officialSupport = assessOfficialSourceSupport({
    factsByCompany,
    payloadOrigins,
    liveCheckedCiks,
  });

  const reportsDir = repoPath("reports/phase3.6");
  mkdirSync(reportsDir, { recursive: true });
  writeJson(join(reportsDir, "corpus-field-provenance.json"), corpusProvenance);
  writeJson(join(reportsDir, "official-source-support.json"), officialSupport);
  writeJson(join(reportsDir, "persistence-summary.json"), {
    ...persistence,
    backend: persistenceBackend,
    postgres_e2e_complete: postgresE2EComplete,
  });

  const criticalBlocks: string[] = [];
  if (retrievalFailures.length) criticalBlocks.push(...retrievalFailures);
  if (derivedFinancial.size < companies.length) {
    criticalBlocks.push(
      `Derived financial features missing for ${companies.length - derivedFinancial.size} companies`
    );
  }

  let snapshotDir = "";
  let publication = evaluateOfficialPublication(
    {
      criticalBlocks,
      contractErrors: [],
      fieldProvenanceDocumented: corpusProvenance.field_definitions.length > 0,
      circularProvenanceDetected: circular,
      illustrativePeerBandCount: illustrativePeerBands.length,
      missingIdentifierCount: resolutions.filter((r) => r.status === "missing")
        .length,
      highSeverityReviewCount: reviewItems.filter((r) => r.severity === "high")
        .length,
      persistenceBackend,
      persistenceComplete: persistence.complete,
      postgresE2EComplete,
      liveEdgarFullFinancialCount: Number(
        officialSupport.summary.live_edgar_full_financial ?? 0
      ),
      companyCount: companies.length,
      liveEdgarAcceptanceSetCount: 0,
      acceptanceSetSize: 5,
      websiteReadinessPassed: false,
      unsupportedPeerTypesIncluded: [],
    },
    FIXED_TS
  );

  if (!options.skipSnapshot) {
    const phase2Export = exportPilotSnapshot({
      data: verifiedData,
      taxonomy,
      weights,
      classifications,
      peers,
      reviewItems,
      adjacencyVersion: adjacency.adjacency_version,
      outputRelativeDir: "exports/snapshots/.staging-v4-official",
      snapshotId: SNAPSHOT_ID,
    });

    snapshotDir = repoPath("exports/snapshots/pilot-v4-official");
    if (existsSync(snapshotDir)) rmSync(snapshotDir, { recursive: true, force: true });
    mkdirSync(join(snapshotDir, "company"), { recursive: true });
    mkdirSync(join(snapshotDir, "peers"), { recursive: true });
    mkdirSync(join(snapshotDir, "evidence"), { recursive: true });
    mkdirSync(join(snapshotDir, "sources"), { recursive: true });

    const stagingDir = phase2Export.snapshotDir;
    for (const name of [
      "taxonomy.json",
      "tree.json",
      "companies.json",
      "review-queue.json",
    ]) {
      writeFileSync(join(snapshotDir, name), readFileSync(join(stagingDir, name)));
    }
    for (const company of verifiedData.companies) {
      writeFileSync(
        join(snapshotDir, "company", `${company.ticker}.json`),
        readFileSync(join(stagingDir, "company", `${company.ticker}.json`))
      );
      writeFileSync(
        join(snapshotDir, "peers", `${company.ticker}.json`),
        readFileSync(join(stagingDir, "peers", `${company.ticker}.json`))
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
        derived_financial: derivedFinancial.get(company.company_key) ?? null,
        provenance_class: PROVENANCE_CLASS,
      });
    }
    rmSync(stagingDir, { recursive: true, force: true });

    writeJson(join(snapshotDir, "corpus-field-provenance.json"), corpusProvenance);
    writeJson(join(snapshotDir, "official-source-support.json"), officialSupport);
    writeJson(join(snapshotDir, "persistence-summary.json"), {
      ...persistence,
      backend: persistenceBackend,
      postgres_e2e_complete: postgresE2EComplete,
    });
    writeJson(join(snapshotDir, "gated-peer-types.json"), {
      scored: VERIFIED_PEER_TYPES,
      excluded_without_market_data: ["valuation", "market_behavior"],
    });

    const manifestDraft = {
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
      published_at: null as string | null,
      as_of: data.universe.as_of,
      is_immutable: true,
      content_hash: null as string | null,
      counts: {
        companies: companies.length,
        taxonomy_nodes: taxonomy.config.nodes.length,
        primary_classifications: classifications.filter((c) => c.primary).length,
        peer_relationships: peers.length,
        evidence_records: verifiedData.evidence.length,
      },
      artifacts: [
        {
          name: "manifest.json",
          uri: "exports/snapshots/pilot-v4-official/manifest.json",
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
        "Phase-3.6 acceptance snapshot. Field provenance documented. Official status requires live EDGAR + Postgres E2E.",
    };

    // Temporary write so readiness can validate structure
    writeJson(join(snapshotDir, "manifest.json"), manifestDraft);

    const readiness = evaluateWebsiteReadiness({
      snapshotDir,
      manifest: manifestDraft,
      scoredPeerTypes: VERIFIED_PEER_TYPES,
      gatedPeerTypes: ["valuation", "market_behavior"],
    });
    writeJson(join(snapshotDir, "website-readiness-report.json"), readiness);
    writeJson(join(reportsDir, "website-readiness-report.json"), readiness);

    publication = evaluateOfficialPublication(
      {
        criticalBlocks,
        contractErrors: phase2Export.validation.errors,
        fieldProvenanceDocumented: true,
        circularProvenanceDetected: circular,
        illustrativePeerBandCount: illustrativePeerBands.length,
        missingIdentifierCount: resolutions.filter((r) => r.status === "missing")
          .length,
        highSeverityReviewCount: reviewItems.filter((r) => r.severity === "high")
          .length,
        persistenceBackend,
        persistenceComplete: persistence.complete,
        postgresE2EComplete,
        liveEdgarFullFinancialCount: Number(
          officialSupport.summary.live_edgar_full_financial ?? 0
        ),
        companyCount: companies.length,
        liveEdgarAcceptanceSetCount: 0,
        acceptanceSetSize: 5,
        websiteReadinessPassed: readiness.passed,
        unsupportedPeerTypesIncluded: [],
      },
      FIXED_TS
    );

    const manifest = {
      ...manifestDraft,
      published_at: publication.published_at,
      parent_snapshot_id: PARENT_SNAPSHOT_ID,
      source_adapter_version: SOURCE_ADAPTER_VERSION,
      normalization_version: NORMALIZATION_VERSION,
      processing_run_id: processingRunId,
      persistence_backend: persistenceBackend,
      postgres_e2e_complete: postgresE2EComplete,
      live_edgar_full_financial: officialSupport.summary.live_edgar_full_financial,
      illustrative_peer_band_count: illustrativePeerBands.length,
      review_item_count: reviewItems.length,
      validation_status: publication.ok ? "passed" : "failed",
      publication_status: publication.publication_status,
      publishable: publication.publishable,
      official: publication.official,
      provenance_class: provenanceClass,
      known_limitations: [
        "Offline default path uses hand-authored approximate corpus values",
        "Official status requires live EDGAR companyfacts for all companies plus Postgres E2E",
        "valuation and market_behavior peer types gated",
        "Segment→taxonomy node mappings remain curated judgments",
      ],
    };

    const {
      parent_snapshot_id,
      source_adapter_version,
      normalization_version,
      processing_run_id,
      persistence_backend,
      postgres_e2e_complete,
      live_edgar_full_financial,
      illustrative_peer_band_count,
      review_item_count,
      validation_status,
      publication_status,
      publishable,
      official,
      provenance_class,
      known_limitations,
      ...contractManifest
    } = manifest;
    void parent_snapshot_id;
    void source_adapter_version;
    void normalization_version;
    void processing_run_id;
    void persistence_backend;
    void postgres_e2e_complete;
    void live_edgar_full_financial;
    void illustrative_peer_band_count;
    void review_item_count;
    void validation_status;
    void publication_status;
    void publishable;
    void official;
    void provenance_class;
    void known_limitations;

    const manifestErrors = validateSnapshotManifest(contractManifest);
    if (manifestErrors.length) {
      publication.ok = false;
      publication.publication_status = "blocked";
      publication.publishable = false;
      publication.official = false;
      publication.blocks.push(...manifestErrors);
    }

    manifest.content_hash = `sha256:${createHash("sha256")
      .update(JSON.stringify(contractManifest))
      .digest("hex")}`;
    writeJson(join(snapshotDir, "manifest.json"), manifest);
    writeJson(join(snapshotDir, "validation-report.json"), {
      publishable: publication.publishable,
      official: publication.official,
      publication_status: publication.publication_status,
      errors: publication.blocks,
      warnings: publication.warnings,
      processing_run_id: processingRunId,
    });
    writeJson(join(reportsDir, "publication-gate.json"), publication);

    if (pgClient) {
      await persistWebsiteReadinessChecks(
        pgClient.client,
        processingRunId,
        readiness.checks
      );
      await finalizePipelineRunRecord(pgClient.client, processingRunId, {
        status: publication.ok ? "succeeded" : "failed",
        snapshotId: SNAPSHOT_ID,
        publicationStatus: publication.publication_status,
        summary: {
          persistence_backend: persistenceBackend,
          postgres_e2e_complete: postgresE2EComplete,
          publication_status: publication.publication_status,
        },
      });
    }
  }

  if (pgClient) {
    pgClient.release();
    try {
      await closePool();
    } catch {
      /* ignore */
    }
  }

  const summary = {
    processing_run_id: processingRunId,
    offline,
    provenance_class: provenanceClass,
    circular_phase2_derived: circular,
    persistence_backend: persistenceBackend,
    postgres_e2e_complete: postgresE2EComplete,
    companies_requested: companies.length,
    companies_resolved: resolutions.filter((r) => r.status === "resolved")
      .length,
    documents_retrieved: documentsRetrieved,
    facts_ingested: factsIngested,
    derived_financial_count: derivedFinancial.size,
    illustrative_peer_band_count: illustrativePeerBands.length,
    official_source_support: officialSupport.summary,
    corpus_field_provenance_fields: corpusProvenance.field_definitions.length,
    publication,
    snapshot_id: SNAPSHOT_ID,
    snapshot_dir: snapshotDir,
    demo: Object.fromEntries(
      ["vz", "mcd", "nvda", "intc", "amt"].map((key) => {
        const cls = classifications.find((c) => c.company_key === key);
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
            primary: cls?.primary?.node_id,
            top_direct_competitors: top,
          },
        ];
      })
    ),
  };

  return {
    ok: publication.ok || options.skipSnapshot === true,
    summary,
    processingRunId,
  };
}
