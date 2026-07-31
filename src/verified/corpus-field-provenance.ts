/**
 * Field-level provenance for the independent offline corpus.
 *
 * Answers: where did every field in independent-corpus.ts come from?
 * These labels are deliberate — none claim live EDGAR retrieval.
 */
import { VERIFIED_CORPUS, VERIFIED_CORPUS_VERSION } from "./independent-corpus.js";

export type FieldOrigin =
  | "hand_authored_offline_approximation"
  | "public_identifier_convention"
  | "hand_authored_disclosure_paraphrase"
  | "derived_at_fixture_generation";

export type SecAuthoritySupport =
  | "supported_by_sec_companyfacts_concept"
  | "supported_by_sec_submissions_identifier"
  | "supported_by_sec_filing_text_extraction"
  | "not_an_sec_structured_field"
  | "curated_taxonomy_judgment_outside_corpus";

export interface CorpusFieldProvenance {
  field_path: string;
  origin: FieldOrigin;
  sec_authority_support: SecAuthoritySupport;
  sec_concepts?: string[];
  notes: string;
}

/** Shared field provenance — applies to every company in the corpus. */
export const CORPUS_FIELD_PROVENANCE: CorpusFieldProvenance[] = [
  {
    field_path: "company_key",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "not_an_sec_structured_field",
    notes: "Internal pilot key; not an SEC identifier.",
  },
  {
    field_path: "ticker",
    origin: "public_identifier_convention",
    sec_authority_support: "supported_by_sec_submissions_identifier",
    notes: "Public exchange ticker; confirmable via SEC submissions.tickers.",
  },
  {
    field_path: "cik",
    origin: "public_identifier_convention",
    sec_authority_support: "supported_by_sec_submissions_identifier",
    notes: "SEC Central Index Key; confirmable via data.sec.gov submissions.",
  },
  {
    field_path: "registrant",
    origin: "public_identifier_convention",
    sec_authority_support: "supported_by_sec_submissions_identifier",
    notes: "Legal registrant name; confirmable via SEC submissions.name.",
  },
  {
    field_path: "exchange",
    origin: "public_identifier_convention",
    sec_authority_support: "supported_by_sec_submissions_identifier",
    notes: "Listing venue; often present on SEC submissions.exchanges.",
  },
  {
    field_path: "foreign_issuer",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_submissions_identifier",
    notes: "Pilot flag for 20-F/6-K forms; confirmable via filing form types.",
  },
  {
    field_path: "business_excerpt",
    origin: "hand_authored_disclosure_paraphrase",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes:
      "Paraphrased Item 1-style text authored for offline tests — not a verbatim EDGAR excerpt until live filings are ingested.",
  },
  {
    field_path: "competition_excerpt",
    origin: "hand_authored_disclosure_paraphrase",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes:
      "Paraphrased competition disclosure for offline extraction tests — not live EDGAR text by default.",
  },
  {
    field_path: "segment_lines[].name",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes:
      "Segment names approximated for offline regex extraction; authoritative values live in filing notes / XBRL dimensions.",
  },
  {
    field_path: "segment_lines[].revenue_pct",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes:
      "Approximate segment mix; not companyfacts scalar. Live support requires segment notes or dimensional XBRL.",
  },
  {
    field_path: "franchise_locations_pct",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes: "Restaurant franchise mix paraphrase for offline regex; confirm in 10-K Item 1.",
  },
  {
    field_path: "semiconductor_model",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes: "Operating-model label (fabless/idm/…); inferred from business description, not a us-gaap concept.",
  },
  {
    field_path: "infrastructure_model",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_filing_text_extraction",
    notes: "Network owner vs infra landlord label; text-derived, not companyfacts.",
  },
  {
    field_path: "facts.revenue_fy2023",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
    ],
    notes: "Approximate USD; replaceable by live companyfacts FY points.",
  },
  {
    field_path: "facts.revenue_fy2024",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
    ],
    notes: "Approximate USD; replaceable by live companyfacts FY points.",
  },
  {
    field_path: "facts.operating_income_fy2024",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: ["OperatingIncomeLoss"],
    notes: "Approximate USD; companyfacts-mappable.",
  },
  {
    field_path: "facts.assets_fy2024",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: ["Assets"],
    notes: "Approximate USD; companyfacts-mappable.",
  },
  {
    field_path: "facts.long_term_debt_fy2024",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: ["LongTermDebt"],
    notes: "Approximate USD; companyfacts-mappable (concept may vary by issuer).",
  },
  {
    field_path: "facts.rd_fy2024",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: ["ResearchAndDevelopmentExpense"],
    notes: "Approximate USD; companyfacts-mappable when reported.",
  },
  {
    field_path: "facts.capex_fy2024",
    origin: "hand_authored_offline_approximation",
    sec_authority_support: "supported_by_sec_companyfacts_concept",
    sec_concepts: ["PaymentsToAcquirePropertyPlantAndEquipment"],
    notes: "Approximate USD; companyfacts-mappable when reported.",
  },
];

export function buildCorpusProvenanceReport() {
  const bySupport: Record<string, number> = {};
  for (const row of CORPUS_FIELD_PROVENANCE) {
    bySupport[row.sec_authority_support] =
      (bySupport[row.sec_authority_support] ?? 0) + 1;
  }
  return {
    verified_corpus_version: VERIFIED_CORPUS_VERSION,
    company_count: VERIFIED_CORPUS.length,
    field_definitions: CORPUS_FIELD_PROVENANCE,
    summary: {
      total_field_definitions: CORPUS_FIELD_PROVENANCE.length,
      by_sec_authority_support: bySupport,
      origin_claim:
        "All numeric and disclosure corpus values are hand-authored offline approximations unless replaced by live EDGAR payloads.",
      not_from_phase2_curated_json: true,
      not_from_live_edgar_by_default: true,
    },
    companies: VERIFIED_CORPUS.map((c) => ({
      company_key: c.company_key,
      ticker: c.ticker,
      cik: c.cik,
      field_count: CORPUS_FIELD_PROVENANCE.length,
    })),
  };
}
