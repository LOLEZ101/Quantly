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
import {
  ACCEPTANCE_SET_KEYS,
  evaluateOfficialPublication,
} from "../publication/official-publication.js";
import { evaluateWebsiteReadiness } from "../publication/website-readiness.js";
import {
  persistPipelineOutputs,
  persistPipelineStage,
} from "../database/unit-of-work.js";
import {
  finalizePipelineRunRecord,
  persistWebsiteReadinessChecks,
} from "../database/postgres-unit-of-work.js";
import {
  bootstrapRepository,
  type RepositoryMode,
} from "../database/repository-mode.js";
import { listMigrations } from "../database/migration-runner.js";
import { loadEnvConfig } from "../database/env.js";
import { repoPath } from "../config/paths.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type { FinancialFeaturesRecord } from "../domain/types.js";
import type { ResolvedCompanyIdentifiers } from "../sources/types.js";
import { XBRL_CONCEPT_MAP_VERSION } from "../normalization/xbrl-concept-map.js";
import { validateSnapshotManifest } from "../validation/validate-outputs.js";

const SNAPSHOT_ID = "snap_pilot_v5_operational";
const PARENT_SNAPSHOT_ID = "snap_pilot_v4_official";
const FIXED_TS = "2026-07-31T20:00:00.000Z";

export interface Phase37Options {
  /** Explicit repository mode — postgres never silently falls back to memory. */
  repository: RepositoryMode;
  /** When true, use strict live EDGAR (no offline companyfacts fallback). */
  liveEdgar: boolean;
  /** Limit to acceptance set keys when true. */
  acceptanceSetOnly?: boolean;
  ticker?: string;
  skipSnapshot?: boolean;
}

export interface Phase37Result {
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

export async function runPhase37Pipeline(
  options: Phase37Options
): Promise<Phase37Result> {
  const processingRunId = `run_phase37_${FIXED_TS.replace(/[:.]/g, "")}`;
  if (listMigrations().length < 3) {
    throw new Error("Expected Phase-3.6 migration 003 to be present");
  }

  const env = loadEnvConfig();
  if (options.liveEdgar && !env.secContactEmail) {
    throw new Error(
      "Live EDGAR requested but SEC_CONTACT_EMAIL is not set. Configure .env before Phase 3.7 live acceptance."
    );
  }

  // Offline HTML/fixtures still used for filing-section extraction; live path
  // owns submissions + companyfacts when liveEdgar=true.
  seedRawCacheFromFixtures("verified_independent");

  const repo = await bootstrapRepository({
    mode: options.repository,
    processingRunId,
    pipelineName: "phase3.7",
  });

  const adapter = createSecAdapter(!options.liveEdgar, {
    corpus: "verified_independent",
    allowOfflineFallback: !options.liveEdgar,
    requireLiveCacheUri: options.liveEdgar,
  });
  const offlineAdapter = new OfflineSecAdapter("verified_independent");
  const provenanceClass = offlineAdapter.provenanceClass();
  const circular = provenanceClass !== PROVENANCE_CLASS;

  const data = loadPilotData();
  const taxonomy = loadTaxonomy();
  const thresholds = loadThresholds();
  const weights = loadPeerWeights();
  const eligibility = loadPeerEligibility();
  const adjacency = loadYamlAdjacency();

  let companies = data.companies;
  if (options.acceptanceSetOnly) {
    const set = new Set<string>(ACCEPTANCE_SET_KEYS);
    companies = companies.filter((c) => set.has(c.company_key));
  }
  if (options.ticker) {
    companies = companies.filter(
      (c) => c.ticker.toUpperCase() === options.ticker!.toUpperCase()
    );
  }

  console.error(
    `[phase3.7] companies=${companies.length} liveEdgar=${options.liveEdgar} repository=${repo.mode}`
  );

  const resolutions: ResolvedCompanyIdentifiers[] = [];
  const factsByCompany = new Map<string, ReturnType<typeof markCanonicalFacts>>();
  const evidenceByCompany = new Map<
    string,
    ReturnType<typeof extractEvidenceCandidates>
  >();
  const derivedFinancial = new Map<string, FinancialFeaturesRecord>();
  const payloadOrigins = new Map<string, { companyfactsUri: string | null }>();
  const liveCheckedCiks = new Set<string>();
  const retrievalFailures: string[] = [];
  let documentsRetrieved = 0;
  let factsIngested = 0;
  let payloadsPersisted = 0;

  try {
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
        if (
          submissions.original_uri.includes("data.sec.gov") &&
          resolution.resolved_cik
        ) {
          liveCheckedCiks.add(resolution.resolved_cik);
        }

        const factsPayload =
          await adapter.fetchStructuredFinancialFacts(resolution);
        cachedPayloads.push(cacheRawPayload(factsPayload, processingRunId));
        documentsRetrieved++;
        payloadOrigins.set(company.company_key, {
          companyfactsUri: factsPayload.original_uri,
        });
        if (
          factsPayload.original_uri.includes("data.sec.gov") &&
          resolution.resolved_cik
        ) {
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
          evidence = extractEvidenceCandidates({
            companyKey: company.company_key,
            sections,
            facts: marked,
            accessionNumber: annual.accession_number,
          });
          evidenceByCompany.set(company.company_key, evidence);
        } else {
          evidenceByCompany.set(company.company_key, []);
        }

        await persistPipelineStage({
          uow: repo.uow,
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

    // For peer graph / classification, use full pilot universe with overlays
    // for companies we processed; others keep curated + offline-derived if present.
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

    // Expand to full universe for peer scoring when acceptance-set-only live fetch:
    // still classify all companies using offline seed for non-fetched peers.
    let workingCompanies = companies;
    let workingProfiles = profiles;
    let workingDerived = derivedFinancial;
    if (options.acceptanceSetOnly && !options.ticker) {
      // Re-ingest remaining companies offline for complete peer graph.
      const offline = createSecAdapter(true, {
        corpus: "verified_independent",
      });
      const fetched = new Set(companies.map((c) => c.company_key));
      const rest = data.companies.filter((c) => !fetched.has(c.company_key));
      for (const company of rest) {
        const resolution = await offline.resolveCompanyIdentifiers({
          company_key: company.company_key,
          legal_name: company.legal_name,
          display_name: company.display_name,
          ticker: company.ticker,
          exchange: company.exchange,
          cik: company.cik,
        });
        resolutions.push(resolution);
        const factsPayload =
          await offline.fetchStructuredFinancialFacts(resolution);
        payloadOrigins.set(company.company_key, {
          companyfactsUri: factsPayload.original_uri,
        });
        const marked = markCanonicalFacts(
          extractFactsFromCompanyFactsPayload(
            company.company_key,
            JSON.parse(factsPayload.content.toString("utf8"))
          )
        );
        factsByCompany.set(company.company_key, marked);
        factsIngested += marked.length;
        const derived = deriveFinancialFeaturesFromFacts({
          companyKey: company.company_key,
          asOf: data.universe.as_of,
          facts: marked,
        });
        if (derived) derivedFinancial.set(company.company_key, derived);
        const filings = await offline.listRelevantFilings(resolution);
        const annual =
          filings.find((f) => ["10-K", "20-F", "40-F"].includes(f.form)) ??
          filings[0];
        let evidence: ReturnType<typeof extractEvidenceCandidates> = [];
        let sections: ReturnType<typeof extractFilingSections> = [];
        if (annual) {
          const doc = await offline.fetchFilingDocument(annual);
          sections = extractFilingSections(doc.content.toString("utf8"));
          evidence = extractEvidenceCandidates({
            companyKey: company.company_key,
            sections,
            facts: marked,
            accessionNumber: annual.accession_number,
          });
        }
        evidenceByCompany.set(company.company_key, evidence);
        await persistPipelineStage({
          uow: repo.uow,
          processingRunId,
          company: {
            company_key: company.company_key,
            legal_name: company.legal_name,
            display_name: company.display_name,
            cik: resolution.resolved_cik,
          },
          resolution,
          facts: marked,
          sections,
          evidence,
        });
      }
      workingCompanies = data.companies;
      workingProfiles = workingCompanies.map((c) =>
        buildSourceBackedProfile({
          companyKey: c.company_key,
          data,
          resolution: resolutions.find((r) => r.company_key === c.company_key)!,
          facts: factsByCompany.get(c.company_key) ?? [],
          evidenceCandidates: evidenceByCompany.get(c.company_key) ?? [],
          asOf: data.universe.as_of,
          derivedFinancial: derivedFinancial.get(c.company_key) ?? null,
        })
      );
      workingDerived = derivedFinancial;
    }

    const verifiedData = buildVerifiedPilotData(
      data,
      workingProfiles,
      workingDerived
    );
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
    reviewItems = [
      ...new Map(reviewItems.map((r) => [r.review_item_id, r])).values(),
    ];

    const persistence = await persistPipelineOutputs({
      uow: repo.uow,
      processingRunId,
      classifications,
      peers,
      reviewItems,
    });
    persistence.source_payloads_inserted = payloadsPersisted;
    persistence.facts_upserted = factsIngested;
    persistence.complete =
      persistence.complete &&
      derivedFinancial.size >= workingCompanies.length;

    let postgresE2EComplete = false;
    if (repo.mode === "postgres" && persistence.complete) {
      const stored = await repo.uow.classifications.list(processingRunId);
      postgresE2EComplete = stored.length === classifications.length;
    }

    const illustrativePeerBands = workingProfiles.flatMap((p) =>
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

    const reportsDir = repoPath("reports/phase3.7");
    mkdirSync(reportsDir, { recursive: true });
    writeJson(join(reportsDir, "corpus-field-provenance.json"), corpusProvenance);
    writeJson(join(reportsDir, "official-source-support.json"), officialSupport);
    writeJson(join(reportsDir, "persistence-summary.json"), {
      ...persistence,
      backend: repo.mode,
      postgres_e2e_complete: postgresE2EComplete,
      database: repo.database ?? null,
      migrations: repo.migration,
    });
    writeJson(join(reportsDir, "repository-mode.json"), {
      mode: repo.mode,
      database: repo.database ?? null,
      migrations: repo.migration,
    });

    const criticalBlocks = [...retrievalFailures];
    if (options.liveEdgar && retrievalFailures.length) {
      // already in criticalBlocks
    }

    let snapshotDir = "";
    let publication = evaluateOfficialPublication(
      {
        criticalBlocks,
        contractErrors: [],
        fieldProvenanceDocumented: true,
        circularProvenanceDetected: circular,
        illustrativePeerBandCount: illustrativePeerBands.length,
        missingIdentifierCount: resolutions.filter((r) => r.status === "missing")
          .length,
        highSeverityReviewCount: reviewItems.filter((r) => r.severity === "high")
          .length,
        persistenceBackend: repo.mode,
        persistenceComplete: persistence.complete,
        postgresE2EComplete,
        liveEdgarFullFinancialCount: Number(
          officialSupport.summary.live_edgar_full_financial ?? 0
        ),
        companyCount: data.companies.length,
        liveEdgarAcceptanceSetCount: Number(
          officialSupport.summary.live_edgar_acceptance_set ?? 0
        ),
        acceptanceSetSize: ACCEPTANCE_SET_KEYS.length,
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
        outputRelativeDir: "exports/snapshots/.staging-v5-operational",
        snapshotId: SNAPSHOT_ID,
      });

      snapshotDir = repoPath("exports/snapshots/pilot-v5-operational");
      if (existsSync(snapshotDir))
        rmSync(snapshotDir, { recursive: true, force: true });
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
        writeFileSync(
          join(snapshotDir, name),
          readFileSync(join(stagingDir, name))
        );
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
        const profile = workingProfiles.find(
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
          derived_financial: derivedFinancial.get(company.company_key) ?? null,
          companyfacts_uri:
            payloadOrigins.get(company.company_key)?.companyfactsUri ?? null,
          provenance_class: PROVENANCE_CLASS,
        });
      }
      rmSync(stagingDir, { recursive: true, force: true });

      writeJson(
        join(snapshotDir, "corpus-field-provenance.json"),
        corpusProvenance
      );
      writeJson(
        join(snapshotDir, "official-source-support.json"),
        officialSupport
      );
      writeJson(join(snapshotDir, "persistence-summary.json"), {
        ...persistence,
        backend: repo.mode,
        postgres_e2e_complete: postgresE2EComplete,
        database: repo.database ?? null,
        migrations: repo.migration,
      });
      writeJson(join(snapshotDir, "repository-mode.json"), {
        mode: repo.mode,
        database: repo.database ?? null,
        migrations: repo.migration,
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
          companies: verifiedData.companies.length,
          taxonomy_nodes: taxonomy.config.nodes.length,
          primary_classifications: classifications.filter((c) => c.primary)
            .length,
          peer_relationships: peers.length,
          evidence_records: verifiedData.evidence.length,
        },
        artifacts: [
          {
            name: "manifest.json",
            uri: "exports/snapshots/pilot-v5-operational/manifest.json",
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
          "Phase-3.7 operational acceptance. Postgres repository mode and live EDGAR verification required for official statuses.",
      };
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
          missingIdentifierCount: resolutions.filter(
            (r) => r.status === "missing"
          ).length,
          highSeverityReviewCount: reviewItems.filter(
            (r) => r.severity === "high"
          ).length,
          persistenceBackend: repo.mode,
          persistenceComplete: persistence.complete,
          postgresE2EComplete,
          liveEdgarFullFinancialCount: Number(
            officialSupport.summary.live_edgar_full_financial ?? 0
          ),
          companyCount: data.companies.length,
          liveEdgarAcceptanceSetCount: Number(
            officialSupport.summary.live_edgar_acceptance_set ?? 0
          ),
          acceptanceSetSize: ACCEPTANCE_SET_KEYS.length,
          websiteReadinessPassed: readiness.passed,
          unsupportedPeerTypesIncluded: [],
        },
        FIXED_TS
      );

      const manifest = {
        ...manifestDraft,
        published_at: publication.published_at,
        parent_snapshot_id: PARENT_SNAPSHOT_ID,
        source_adapter_version: "1.1.0",
        normalization_version: XBRL_CONCEPT_MAP_VERSION,
        processing_run_id: processingRunId,
        repository_mode: repo.mode,
        persistence_backend: repo.mode,
        postgres_e2e_complete: postgresE2EComplete,
        database_host: repo.database?.host ?? null,
        database_name: repo.database?.database ?? null,
        live_edgar_enabled: options.liveEdgar,
        live_edgar_full_financial:
          officialSupport.summary.live_edgar_full_financial,
        live_edgar_acceptance_set:
          officialSupport.summary.live_edgar_acceptance_set,
        publication_status: publication.publication_status,
        publishable: publication.publishable,
        official: publication.official,
        validation_status: publication.ok ? "passed" : "failed",
        known_limitations: [
          "Filing HTML section extraction may still use offline verified excerpts",
          "valuation and market_behavior peer types remain gated",
          "Segment→taxonomy node mappings remain curated judgments",
        ],
      };

      const {
        parent_snapshot_id,
        source_adapter_version,
        normalization_version,
        processing_run_id,
        repository_mode,
        persistence_backend,
        postgres_e2e_complete,
        database_host,
        database_name,
        live_edgar_enabled,
        live_edgar_full_financial,
        live_edgar_acceptance_set,
        publication_status,
        publishable,
        official,
        validation_status,
        known_limitations,
        ...contractManifest
      } = manifest;
      void parent_snapshot_id;
      void source_adapter_version;
      void normalization_version;
      void processing_run_id;
      void repository_mode;
      void persistence_backend;
      void postgres_e2e_complete;
      void database_host;
      void database_name;
      void live_edgar_enabled;
      void live_edgar_full_financial;
      void live_edgar_acceptance_set;
      void publication_status;
      void publishable;
      void official;
      void validation_status;
      void known_limitations;

      const manifestErrors = validateSnapshotManifest(contractManifest);
      if (manifestErrors.length) {
        publication.ok = false;
        publication.publication_status = "blocked";
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

      if (repo.pg) {
        await persistWebsiteReadinessChecks(
          repo.pg.client,
          processingRunId,
          readiness.checks
        );
        await finalizePipelineRunRecord(repo.pg.client, processingRunId, {
          status: publication.ok ? "succeeded" : "failed",
          snapshotId: SNAPSHOT_ID,
          publicationStatus: publication.publication_status,
          summary: {
            repository_mode: repo.mode,
            postgres_e2e_complete: postgresE2EComplete,
            live_edgar: options.liveEdgar,
            publication_status: publication.publication_status,
          },
        });
      }
    }

    const summary = {
      processing_run_id: processingRunId,
      repository_mode: repo.mode,
      database: repo.database ?? null,
      migrations: repo.migration,
      live_edgar: options.liveEdgar,
      postgres_e2e_complete: postgresE2EComplete,
      companies_processed_live_or_primary: companies.length,
      companies_in_snapshot: workingCompanies.length,
      facts_ingested: factsIngested,
      documents_retrieved: documentsRetrieved,
      retrieval_failures: retrievalFailures,
      official_source_support: officialSupport.summary,
      publication,
      snapshot_id: SNAPSHOT_ID,
      snapshot_dir: snapshotDir,
      demo: Object.fromEntries(
        ["vz", "mcd", "nvda", "intc", "amt"].map((key) => {
          const cls = classifications.find((c) => c.company_key === key);
          const top = peers
            .filter(
              (p) =>
                p.target_company_id === key &&
                p.peer_type === "direct_competitor"
            )
            .slice(0, 5)
            .map((p) => ({
              peer: p.peer_company_id,
              score: p.score,
              rank: p.rank,
            }));
          return [key, { primary: cls?.primary?.node_id, top_direct_competitors: top }];
        })
      ),
    };

    return {
      ok: publication.ok || options.skipSnapshot === true,
      summary,
      processingRunId,
    };
  } finally {
    await repo.release();
  }
}
