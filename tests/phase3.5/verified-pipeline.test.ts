import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runPhase35Pipeline } from "../../src/pipeline/run-phase3.5.js";
import { OfflineSecAdapter } from "../../src/sources/sec/offline-adapter.js";
import { deriveFinancialFeaturesFromFacts } from "../../src/profiles/derive-financial-features.js";
import { evaluateVerifiedPublication } from "../../src/publication/hardened-publication.js";
import { VERIFIED_PEER_TYPES } from "../../src/peers/verified-peer-types.js";
import { PROVENANCE_CLASS } from "../../src/verified/independent-corpus.js";
import { createInMemoryUnitOfWork } from "../../src/database/unit-of-work.js";

describe("Phase-3.5 provenance and verified pipeline", () => {
  it("verified corpus is independent of Phase-2 circular fixtures", () => {
    const verified = new OfflineSecAdapter("verified_independent");
    const legacy = new OfflineSecAdapter("legacy_circular");
    expect(verified.provenanceClass()).toBe(PROVENANCE_CLASS);
    expect(legacy.provenanceClass()).not.toBe(PROVENANCE_CLASS);
    expect(existsSync("data/verified/sec/index.json")).toBe(true);
    const index = JSON.parse(
      readFileSync("data/verified/sec/index.json", "utf8")
    );
    expect(index.provenance_class).toBe(PROVENANCE_CLASS);
    expect(Object.keys(index.companies).length).toBe(30);
  });

  it("derives financial bands from multi-year revenue facts", () => {
    const derived = deriveFinancialFeaturesFromFacts({
      companyKey: "nvda",
      asOf: "2025-12-31",
      facts: [
        {
          company_key: "nvda",
          concept: "Revenues",
          taxonomy_namespace: "us-gaap",
          original_label: "Revenues",
          normalized_metric: "revenue",
          value_numeric: 27000000000,
          unit: "USD",
          start_date: null,
          end_date: "2023-12-31",
          filing_date: "2024-02-15",
          accession_number: "a",
          fiscal_year: 2023,
          fiscal_period: "FY",
          form: "10-K",
          frame: "CY2023",
          is_segment: false,
          data_quality_status: "normalized",
          is_canonical: true,
        },
        {
          company_key: "nvda",
          concept: "Revenues",
          taxonomy_namespace: "us-gaap",
          original_label: "Revenues",
          normalized_metric: "revenue",
          value_numeric: 60900000000,
          unit: "USD",
          start_date: null,
          end_date: "2024-12-31",
          filing_date: "2025-02-15",
          accession_number: "b",
          fiscal_year: 2024,
          fiscal_period: "FY",
          form: "10-K",
          frame: "CY2024",
          is_segment: false,
          data_quality_status: "normalized",
          is_canonical: true,
        },
        {
          company_key: "nvda",
          concept: "OperatingIncomeLoss",
          taxonomy_namespace: "us-gaap",
          original_label: "OI",
          normalized_metric: "operating_income",
          value_numeric: 33000000000,
          unit: "USD",
          start_date: null,
          end_date: "2024-12-31",
          filing_date: "2025-02-15",
          accession_number: "b",
          fiscal_year: 2024,
          fiscal_period: "FY",
          form: "10-K",
          frame: "CY2024",
          is_segment: false,
          data_quality_status: "normalized",
          is_canonical: true,
        },
        {
          company_key: "nvda",
          concept: "Assets",
          taxonomy_namespace: "us-gaap",
          original_label: "Assets",
          normalized_metric: "assets",
          value_numeric: 66000000000,
          unit: "USD",
          start_date: null,
          end_date: "2024-12-31",
          filing_date: "2025-02-15",
          accession_number: "b",
          fiscal_year: 2024,
          fiscal_period: "FY",
          form: "10-K",
          frame: "CY2024",
          is_segment: false,
          data_quality_status: "normalized",
          is_canonical: true,
        },
        {
          company_key: "nvda",
          concept: "LongTermDebt",
          taxonomy_namespace: "us-gaap",
          original_label: "Debt",
          normalized_metric: "long_term_debt",
          value_numeric: 8500000000,
          unit: "USD",
          start_date: null,
          end_date: "2024-12-31",
          filing_date: "2025-02-15",
          accession_number: "b",
          fiscal_year: 2024,
          fiscal_period: "FY",
          form: "10-K",
          frame: "CY2024",
          is_segment: false,
          data_quality_status: "normalized",
          is_canonical: true,
        },
      ],
    });
    expect(derived).not.toBeNull();
    expect(derived!.size_band.value).toBe("mega");
    expect(derived!.revenue_growth_band.value).toBe("high");
    expect(derived!.profitability_band.value).toBe("high");
    expect(derived!.size_band.quality).toBe("derived");
  });

  it("publication gate blocks circular and illustrative peer bands", () => {
    const blocked = evaluateVerifiedPublication(
      {
        criticalBlocks: [],
        contractErrors: [],
        provenanceClass: "circular_phase2_derived",
        circularProvenanceDetected: true,
        illustrativePeerBandCount: 5,
        illustrativeFallbackCount: 10,
        unsupportedPeerTypesIncluded: ["valuation"],
        missingIdentifierCount: 0,
        highSeverityReviewCount: 0,
        persistenceComplete: true,
        liveEdgarVerified: false,
      },
      "2026-07-31T12:00:00.000Z"
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.publication_status).toBe("blocked");

    const ok = evaluateVerifiedPublication(
      {
        criticalBlocks: [],
        contractErrors: [],
        provenanceClass: PROVENANCE_CLASS,
        circularProvenanceDetected: false,
        illustrativePeerBandCount: 0,
        illustrativeFallbackCount: 12,
        unsupportedPeerTypesIncluded: [],
        missingIdentifierCount: 0,
        highSeverityReviewCount: 0,
        persistenceComplete: true,
        liveEdgarVerified: false,
      },
      "2026-07-31T12:00:00.000Z"
    );
    expect(ok.ok).toBe(true);
    expect(ok.publication_status).toBe("verified_offline_independent");
  });

  it("in-memory unit of work persists pipeline entities", async () => {
    const uow = createInMemoryUnitOfWork();
    await uow.companies.upsertByKey({
      company_key: "vz",
      legal_name: "Verizon",
      display_name: "Verizon",
      cik: "0000732712",
    });
    expect(await uow.companies.findByKey("vz")).not.toBeNull();
    await uow.reviewItems.replaceAll([], "run_test");
    expect(await uow.reviewItems.list("run_test")).toEqual([]);
  });

  it("verified peer types exclude valuation and market_behavior", () => {
    expect(VERIFIED_PEER_TYPES).not.toContain("valuation");
    expect(VERIFIED_PEER_TYPES).not.toContain("market_behavior");
    expect(VERIFIED_PEER_TYPES).toContain("direct_competitor");
  });

  it("runs verified offline pipeline and emits pilot-v3-verified", async () => {
    const result = await runPhase35Pipeline({ offline: true });
    expect(result.ok).toBe(true);
    expect(result.summary.circular_phase2_derived).toBe(false);
    expect(result.summary.provenance_class).toBe(PROVENANCE_CLASS);
    expect(result.summary.derived_financial_count).toBe(30);
    expect(result.summary.illustrative_peer_band_count).toBe(0);
    expect(
      (result.summary.publication as { publication_status: string })
        .publication_status
    ).toBe("verified_offline_independent");

    expect(existsSync("exports/snapshots/pilot-v3-verified/manifest.json")).toBe(
      true
    );
    expect(existsSync("exports/snapshots/pilot-v1/manifest.json")).toBe(true);
    // Phase-3 snapshot must remain if previously generated; do not require rewrite here.
    const manifest = JSON.parse(
      readFileSync("exports/snapshots/pilot-v3-verified/manifest.json", "utf8")
    );
    expect(manifest.snapshot_id).toBe("snap_pilot_v3_verified");
    expect(manifest.parent_snapshot_id).toBe("snap_pilot_v2_sourced");
    expect(manifest.publication_status).toBe("verified_offline_independent");
    expect(manifest.publication_status).not.toBe("published");

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
    expect(demo.vz.top_direct_competitors.map((p) => p.peer)).not.toContain(
      "amt"
    );
    expect(demo.mcd.primary).toBe("qsr_franchise_heavy");
    expect(demo.nvda.primary).toBe("fabless_compute_and_ai_accelerators");
    expect(demo.nvda.top_direct_competitors[0].peer).toBe("amd");
    expect(demo.intc.primary).toBe("integrated_device_manufacturers");
    expect(demo.amt.primary).toBe("tower_and_macro_site_operators");
    expect(demo.amt.top_direct_competitors.map((p) => p.peer)).toEqual(["cci"]);
  }, 180000);
});
