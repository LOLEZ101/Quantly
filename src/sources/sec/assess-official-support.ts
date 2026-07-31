import type { NormalizedFinancialFact } from "../normalization/normalize-financial-fact.js";
import { CORPUS_FIELD_PROVENANCE } from "../../verified/corpus-field-provenance.js";
import { VERIFIED_CORPUS } from "../../verified/independent-corpus.js";

export interface OfficialSourceSupportRow {
  company_key: string;
  ticker: string;
  cik: string;
  identifier_live_checked: boolean;
  companyfacts_live_uri: string | null;
  companyfacts_source: "live_edgar" | "offline_verified_fixture" | "missing";
  metrics_present: string[];
  metrics_missing: string[];
  authoritative_financial_support: "none" | "partial" | "full_offline_mapped" | "live_edgar";
}

const CORE_METRICS = ["revenue", "operating_income", "assets"] as const;
const REQUIRED_METRICS = [
  "revenue",
  "operating_income",
  "assets",
  "long_term_debt",
  "rd_expense",
  "capex",
] as const;

/**
 * Assess which corpus-backed financial metrics are present in normalized facts
 * and whether payloads came from live EDGAR URIs.
 */
export function assessOfficialSourceSupport(input: {
  factsByCompany: Map<string, NormalizedFinancialFact[]>;
  payloadOrigins: Map<string, { companyfactsUri: string | null }>;
  liveCheckedCiks?: Set<string>;
}): {
  rows: OfficialSourceSupportRow[];
  summary: Record<string, unknown>;
  field_authority_matrix: typeof CORPUS_FIELD_PROVENANCE;
} {
  const rows: OfficialSourceSupportRow[] = [];
  for (const company of VERIFIED_CORPUS) {
    const facts = input.factsByCompany.get(company.company_key) ?? [];
    const metrics = new Set(
      facts
        .map((f) => f.normalized_metric)
        .filter((m): m is string => Boolean(m))
    );
    const present = REQUIRED_METRICS.filter((m) => metrics.has(m));
    const missing = REQUIRED_METRICS.filter((m) => !metrics.has(m));
    const corePresent = CORE_METRICS.every((m) => metrics.has(m));
    const origin = input.payloadOrigins.get(company.company_key);
    const uri = origin?.companyfactsUri ?? null;
    const live =
      Boolean(uri?.includes("data.sec.gov")) ||
      Boolean(input.liveCheckedCiks?.has(company.cik));
    let authoritative: OfficialSourceSupportRow["authoritative_financial_support"] =
      "none";
    if (live && corePresent) {
      authoritative = "live_edgar";
    } else if (present.length === REQUIRED_METRICS.length) {
      authoritative = "full_offline_mapped";
    } else if (present.length > 0) {
      authoritative = "partial";
    }
    rows.push({
      company_key: company.company_key,
      ticker: company.ticker,
      cik: company.cik,
      identifier_live_checked: Boolean(input.liveCheckedCiks?.has(company.cik)),
      companyfacts_live_uri: live ? uri : null,
      companyfacts_source: live
        ? "live_edgar"
        : facts.length
          ? "offline_verified_fixture"
          : "missing",
      metrics_present: present,
      metrics_missing: [...missing],
      authoritative_financial_support: authoritative,
    });
  }

  const liveCount = rows.filter(
    (r) => r.authoritative_financial_support === "live_edgar"
  ).length;
  const offlineFull = rows.filter(
    (r) => r.authoritative_financial_support === "full_offline_mapped"
  ).length;
  const acceptanceKeys = new Set(["vz", "mcd", "nvda", "intc", "amt"]);
  const liveAcceptance = rows.filter(
    (r) =>
      acceptanceKeys.has(r.company_key) &&
      r.authoritative_financial_support === "live_edgar"
  ).length;

  return {
    rows,
    field_authority_matrix: CORPUS_FIELD_PROVENANCE,
    summary: {
      companies: rows.length,
      live_edgar_full_financial: liveCount,
      live_edgar_acceptance_set: liveAcceptance,
      acceptance_set_size: acceptanceKeys.size,
      offline_fixture_full_financial: offlineFull,
      companyfacts_mappable_field_defs: CORPUS_FIELD_PROVENANCE.filter(
        (f) => f.sec_authority_support === "supported_by_sec_companyfacts_concept"
      ).length,
      filing_text_field_defs: CORPUS_FIELD_PROVENANCE.filter(
        (f) => f.sec_authority_support === "supported_by_sec_filing_text_extraction"
      ).length,
      conclusion:
        liveCount === rows.length
          ? "All pilot companies have live EDGAR companyfacts covering core metrics."
          : liveAcceptance === acceptanceKeys.size
            ? "Acceptance set has live EDGAR core financials; full pilot not yet complete."
            : "Default path uses offline approximations; live EDGAR coverage is incomplete — snapshot must not claim full official status.",
    },
  };
}
