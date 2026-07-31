import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCorpusProvenanceReport } from "../../src/verified/corpus-field-provenance.js";
import { assessOfficialSourceSupport } from "../../src/sources/sec/assess-official-support.js";
import { evaluateOfficialPublication } from "../../src/publication/official-publication.js";
import { runPhase36Pipeline } from "../../src/pipeline/run-phase3.6.js";
import { listMigrations } from "../../src/database/migration-runner.js";
import { VERIFIED_CORPUS } from "../../src/verified/independent-corpus.js";

describe("Phase-3.6 acceptance", () => {
  it("documents field-level corpus provenance for every shared field", () => {
    const report = buildCorpusProvenanceReport();
    expect(report.company_count).toBe(30);
    expect(report.field_definitions.length).toBeGreaterThanOrEqual(18);
    expect(report.summary.not_from_phase2_curated_json).toBe(true);
    expect(report.summary.not_from_live_edgar_by_default).toBe(true);
    const paths = report.field_definitions.map((f) => f.field_path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "cik",
        "facts.revenue_fy2024",
        "business_excerpt",
        "segment_lines[].revenue_pct",
      ])
    );
  });

  it("maps financial fields to SEC companyfacts concepts and refuses live claim offline", () => {
    const factsByCompany = new Map(
      VERIFIED_CORPUS.map((c) => [
        c.company_key,
        [
          {
            company_key: c.company_key,
            concept: "Revenues",
            taxonomy_namespace: "us-gaap",
            original_label: null,
            normalized_metric: "revenue",
            value_numeric: c.facts.revenue_fy2024,
            unit: "USD",
            start_date: null,
            end_date: "2024-12-31",
            filing_date: null,
            accession_number: null,
            fiscal_year: 2024,
            fiscal_period: "FY",
            form: "10-K",
            frame: "CY2024",
            is_segment: false,
            data_quality_status: "normalized" as const,
          },
        ],
      ])
    );
    const support = assessOfficialSourceSupport({
      factsByCompany,
      payloadOrigins: new Map(
        VERIFIED_CORPUS.map((c) => [
          c.company_key,
          { companyfactsUri: `fixture://verified/${c.company_key}` },
        ])
      ),
    });
    expect(support.summary.live_edgar_full_financial).toBe(0);
    expect(
      support.field_authority_matrix.some(
        (f) =>
          f.field_path === "facts.revenue_fy2024" &&
          f.sec_authority_support === "supported_by_sec_companyfacts_concept"
      )
    ).toBe(true);
  });

  it("publication gate never marks official without live EDGAR + Postgres", () => {
    const incomplete = evaluateOfficialPublication(
      {
        criticalBlocks: [],
        contractErrors: [],
        fieldProvenanceDocumented: true,
        circularProvenanceDetected: false,
        illustrativePeerBandCount: 0,
        missingIdentifierCount: 0,
        highSeverityReviewCount: 0,
        persistenceBackend: "memory",
        persistenceComplete: true,
        postgresE2EComplete: false,
        liveEdgarFullFinancialCount: 0,
        companyCount: 30,
        liveEdgarAcceptanceSetCount: 0,
        acceptanceSetSize: 5,
        websiteReadinessPassed: true,
        unsupportedPeerTypesIncluded: [],
      },
      "2026-07-31T18:00:00.000Z"
    );
    expect(incomplete.official).toBe(false);
    expect(incomplete.publishable).toBe(false);
    expect(incomplete.publication_status).not.toBe("official");
    expect(incomplete.publication_status).toBe("website_ready_not_official");

    const official = evaluateOfficialPublication(
      {
        criticalBlocks: [],
        contractErrors: [],
        fieldProvenanceDocumented: true,
        circularProvenanceDetected: false,
        illustrativePeerBandCount: 0,
        missingIdentifierCount: 0,
        highSeverityReviewCount: 0,
        persistenceBackend: "postgres",
        persistenceComplete: true,
        postgresE2EComplete: true,
        liveEdgarFullFinancialCount: 30,
        companyCount: 30,
        liveEdgarAcceptanceSetCount: 5,
        acceptanceSetSize: 5,
        websiteReadinessPassed: true,
        unsupportedPeerTypesIncluded: [],
      },
      "2026-07-31T18:00:00.000Z"
    );
    expect(official.official).toBe(true);
    expect(official.publication_status).toBe("official_full_pilot_verified");
  });

  it("includes Phase-3.6 migration 003", () => {
    const ids = listMigrations().map((m) => m.id);
    expect(ids).toContain("003_phase36_pipeline_persistence");
  });

  it("runs acceptance pipeline and emits pilot-v4-official without claiming official offline", async () => {
    const result = await runPhase36Pipeline({
      offline: true,
      preferPostgres: false,
    });
    expect(result.ok).toBe(true);
    expect(result.summary.circular_phase2_derived).toBe(false);
    expect(result.summary.persistence_backend).toBe("memory");
    expect(result.summary.postgres_e2e_complete).toBe(false);
    const publication = result.summary.publication as {
      official: boolean;
      publishable: boolean;
      publication_status: string;
    };
    expect(publication.official).toBe(false);
    expect(publication.publishable).toBe(false);
    expect(publication.publication_status).not.toBe("official");
    expect(publication.publication_status).not.toBe("published");

    expect(existsSync("exports/snapshots/pilot-v4-official/manifest.json")).toBe(
      true
    );
    expect(existsSync("exports/snapshots/pilot-v3-verified/manifest.json")).toBe(
      true
    );
    expect(existsSync("exports/snapshots/pilot-v1/manifest.json")).toBe(true);

    const manifest = JSON.parse(
      readFileSync("exports/snapshots/pilot-v4-official/manifest.json", "utf8")
    );
    expect(manifest.snapshot_id).toBe("snap_pilot_v4_official");
    expect(manifest.parent_snapshot_id).toBe("snap_pilot_v3_verified");
    expect(manifest.official).toBe(false);
    expect(manifest.publishable).toBe(false);

    expect(
      existsSync(
        "exports/snapshots/pilot-v4-official/corpus-field-provenance.json"
      )
    ).toBe(true);
    expect(
      existsSync(
        "exports/snapshots/pilot-v4-official/official-source-support.json"
      )
    ).toBe(true);
    expect(
      existsSync(
        "exports/snapshots/pilot-v4-official/website-readiness-report.json"
      )
    ).toBe(true);

    const demo = result.summary.demo as Record<
      string,
      {
        primary: string;
        top_direct_competitors: Array<{ peer: string }>;
      }
    >;
    expect(demo.vz.primary).toBe("national_wireless_network_owners");
    expect(demo.vz.top_direct_competitors.map((p) => p.peer)).toEqual(
      expect.arrayContaining(["t", "tmus"])
    );
    expect(demo.mcd.primary).toBe("qsr_franchise_heavy");
    expect(demo.nvda.primary).toBe("fabless_compute_and_ai_accelerators");
    expect(demo.nvda.top_direct_competitors[0].peer).toBe("amd");
    expect(demo.intc.primary).toBe("integrated_device_manufacturers");
    expect(demo.amt.primary).toBe("tower_and_macro_site_operators");
  }, 180000);
});
