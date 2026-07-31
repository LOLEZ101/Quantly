import { describe, expect, it } from "vitest";
import { OfflineSecAdapter } from "../../src/sources/sec/offline-adapter.js";
import { extractFactsFromCompanyFactsPayload } from "../../src/normalization/normalize-financial-fact.js";
import { markCanonicalFacts, selectCanonicalFact } from "../../src/normalization/select-canonical-fact.js";
import { extractFilingSections } from "../../src/normalization/extract-filing-sections.js";
import { extractEvidenceCandidates } from "../../src/evidence/extract-evidence-candidates.js";
import { mapConcept, XBRL_CONCEPT_MAP } from "../../src/normalization/xbrl-concept-map.js";
import { sha256, seedRawCacheFromFixtures, cacheRawPayload } from "../../src/sources/raw-cache.js";

describe("Phase-3 offline SEC + normalization", () => {
  const adapter = new OfflineSecAdapter();

  it("resolves pilot identifiers from fixtures", async () => {
    const resolved = await adapter.resolveCompanyIdentifiers({
      company_key: "vz",
      legal_name: "Verizon Communications Inc.",
      display_name: "Verizon",
      ticker: "VZ",
      exchange: "NYSE",
      cik: "0000732712",
    });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_cik).toBe("0000732712");
  });

  it("maps XBRL concepts and selects canonical facts deterministically", async () => {
    expect(mapConcept("Revenues")?.normalized_metric).toBe("revenue");
    expect(mapConcept("Revenue")?.normalized_metric).toBe("revenue");
    expect(
      mapConcept("ProfitLossFromOperatingActivities")?.normalized_metric
    ).toBe("operating_income");
    expect(mapConcept("LongtermBorrowings")?.normalized_metric).toBe(
      "long_term_debt"
    );
    expect(XBRL_CONCEPT_MAP.length).toBeGreaterThan(5);

    const factsPayload = await adapter.fetchStructuredFinancialFacts({
      company_key: "nvda",
      configured_name: "NVIDIA",
      configured_ticker: "NVDA",
      resolved_cik: "0001045810",
      resolved_registrant: "NVIDIA Corporation",
      exchange: "NASDAQ",
      foreign_issuer: false,
      identifier_confidence: 1,
      status: "resolved",
      discrepancy: null,
      former_names: [],
    });
    const facts = extractFactsFromCompanyFactsPayload(
      "nvda",
      JSON.parse(factsPayload.content.toString("utf8"))
    );
    const marked = markCanonicalFacts(facts);
    expect(marked.some((f) => f.normalized_metric === "revenue")).toBe(true);
    const selected = selectCanonicalFact(marked, "revenue", "2024-12-31");
    expect(selected.selected).toBeTruthy();
    const again = selectCanonicalFact(marked, "revenue", "2024-12-31");
    expect(again.selected?.value_numeric).toBe(selected.selected?.value_numeric);
  });

  it("extracts filing sections and evidence candidates without LLM", async () => {
    const filings = await adapter.listRelevantFilings({
      company_key: "mcd",
      configured_name: "McDonald's",
      configured_ticker: "MCD",
      resolved_cik: "0000063908",
      resolved_registrant: "McDonald's Corporation",
      exchange: "NYSE",
      foreign_issuer: false,
      identifier_confidence: 1,
      status: "resolved",
      discrepancy: null,
      former_names: [],
    });
    const doc = await adapter.fetchFilingDocument(filings[0]);
    const sections = extractFilingSections(doc.content.toString("utf8"));
    expect(sections.find((s) => s.section_type === "business")?.unresolved).toBe(
      false
    );
    const factsPayload = await adapter.fetchStructuredFinancialFacts({
      company_key: "mcd",
      configured_name: "McDonald's",
      configured_ticker: "MCD",
      resolved_cik: "0000063908",
      resolved_registrant: "McDonald's Corporation",
      exchange: "NYSE",
      foreign_issuer: false,
      identifier_confidence: 1,
      status: "resolved",
      discrepancy: null,
      former_names: [],
    });
    const facts = markCanonicalFacts(
      extractFactsFromCompanyFactsPayload(
        "mcd",
        JSON.parse(factsPayload.content.toString("utf8"))
      )
    );
    const evidence = extractEvidenceCandidates({
      companyKey: "mcd",
      sections,
      facts,
      accessionNumber: filings[0].accession_number,
    });
    expect(evidence.some((e) => e.proposed_evidence_type === "franchise_locations_pct")).toBe(
      true
    );
    expect(evidence.every((e) => e.source_location)).toBe(true);
    expect(evidence.every((e) => e.confidence >= 0 && e.confidence <= 1)).toBe(
      true
    );
  });

  it("caches payloads immutably by checksum", () => {
    const content = Buffer.from("hello-source");
    const hash = sha256(content);
    const first = cacheRawPayload({
      source_type: "documents",
      source_identifier: "test-accn",
      company_key: "vz",
      cik: "0000732712",
      content_type: "text/plain",
      content,
      original_uri: "fixture://test",
      accession_number: "test-accn",
      filing_form: "10-K",
      filing_date: "2025-02-15",
    });
    const second = cacheRawPayload({
      source_type: "documents",
      source_identifier: "test-accn",
      company_key: "vz",
      cik: "0000732712",
      content_type: "text/plain",
      content,
      original_uri: "fixture://test",
      accession_number: "test-accn",
      filing_form: "10-K",
      filing_date: "2025-02-15",
    });
    expect(first.content_hash).toBe(hash);
    expect(second.content_hash).toBe(first.content_hash);
    expect(seedRawCacheFromFixtures()).toBeGreaterThan(30);
  });
});
