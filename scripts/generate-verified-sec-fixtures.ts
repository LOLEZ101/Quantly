/**
 * Generates independent offline SEC-like fixtures from the verified corpus.
 * MUST NOT import Phase-2 curated segment/operating JSON.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  PROVENANCE_CLASS,
  VERIFIED_CORPUS,
  VERIFIED_CORPUS_VERSION,
  type VerifiedCompanyCorpus,
} from "../src/verified/independent-corpus.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data/verified/sec");

function cikPath(cik: string): string {
  return cik.replace(/^0+/, "") || "0";
}

function accession(cik: string, seq: number): string {
  const n = cikPath(cik).padStart(10, "0");
  return `${n.slice(0, 10)}-24-000${seq}`;
}

function usdPoint(
  cik: string,
  val: number,
  fy: number,
  end: string,
  filed: string
) {
  return {
    end,
    val,
    accn: accession(cik, 1),
    fy,
    fp: "FY",
    form: "10-K",
    filed,
    frame: `CY${fy}`,
  };
}

function businessHtml(c: VerifiedCompanyCorpus): string {
  const segLines = c.segment_lines
    .map((s) => `${s.name} (${Math.round(s.revenue_pct * 100)}% of revenue)`)
    .join("; ");

  const franchiseLine =
    c.franchise_locations_pct == null
      ? ""
      : `<p>As of year end, approximately ${Math.round(
          c.franchise_locations_pct * 100
        )}% of system restaurants were franchised and the remainder were company-operated.</p>`;

  let modelLine = "";
  switch (c.semiconductor_model) {
    case "fabless":
      modelLine =
        "<p>Our semiconductor business model is fabless. We design semiconductors and outsource manufacturing to foundries.</p>";
      break;
    case "idm":
      modelLine =
        "<p>Our semiconductor business model is idm. We design and manufacture semiconductors in captive fabrication facilities and also describe foundry services initiatives.</p>";
      break;
    case "foundry":
      modelLine =
        "<p>Our semiconductor business model is foundry. We operate as a pure-play foundry manufacturing wafers for third-party designers.</p>";
      break;
    case "equipment":
      modelLine =
        "<p>Our semiconductor business model is equipment. We supply wafer fabrication equipment to semiconductor manufacturers.</p>";
      break;
    case "memory":
      modelLine =
        "<p>Our semiconductor business model is memory. We design and manufacture memory semiconductors in captive fabrication facilities.</p>";
      break;
    case "analog":
      modelLine =
        "<p>Our semiconductor business model is analog. We produce analog and mixed-signal devices.</p>";
      break;
    default:
      break;
  }

  if (c.infrastructure_model === "infra_landlord") {
    modelLine +=
      "<p>Our infrastructure/operating model includes: communications infrastructure landlord. We lease communications sites to wireless carriers and are not a retail wireless network operator.</p>";
  } else if (c.infrastructure_model === "network_owner") {
    modelLine +=
      "<p>Our infrastructure/operating model includes: nationwide wireless network owner.</p>";
  }

  return `<html><body>
<meta name="provenance_class" content="${PROVENANCE_CLASS}" />
<meta name="verified_corpus_version" content="${VERIFIED_CORPUS_VERSION}" />
<a id="item1"></a><h1>Item 1. Business</h1>
<p>${c.registrant} (${c.ticker}) is a registrant under the Securities Exchange Act.</p>
<p>${c.business_excerpt}</p>
<p>Principal operations: ${c.registrant}. Reported segments include: ${segLines}.</p>
${modelLine}
${franchiseLine}
<a id="item1a"></a><h1>Item 1A. Risk Factors</h1>
<p>Our business is subject to competitive, regulatory, and technology risks.</p>
<a id="competition"></a><h2>Competition</h2>
<p>${c.competition_excerpt}</p>
<a id="segments"></a><h1>Notes to Financial Statements — Segment Information</h1>
<p>Revenue by segment: ${segLines}.</p>
<a id="geographic"></a><h2>Geographic Information</h2>
<p>We generate revenue primarily in the United States and other international markets.</p>
</body></html>`;
}

function companyFacts(c: VerifiedCompanyCorpus) {
  const f = c.facts;
  return {
    entityName: c.registrant,
    cik: cikPath(c.cik),
    provenance_class: PROVENANCE_CLASS,
    verified_corpus_version: VERIFIED_CORPUS_VERSION,
    facts: {
      "us-gaap": {
        Revenues: {
          label: "Revenues",
          units: {
            USD: [
              usdPoint(c.cik, f.revenue_fy2023, 2023, "2023-12-31", "2024-02-15"),
              usdPoint(c.cik, f.revenue_fy2024, 2024, "2024-12-31", "2025-02-15"),
            ],
          },
        },
        OperatingIncomeLoss: {
          label: "Operating Income (Loss)",
          units: {
            USD: [
              usdPoint(
                c.cik,
                f.operating_income_fy2024,
                2024,
                "2024-12-31",
                "2025-02-15"
              ),
            ],
          },
        },
        Assets: {
          label: "Assets",
          units: {
            USD: [
              usdPoint(c.cik, f.assets_fy2024, 2024, "2024-12-31", "2025-02-15"),
            ],
          },
        },
        LongTermDebt: {
          label: "Long-term Debt",
          units: {
            USD: [
              usdPoint(
                c.cik,
                f.long_term_debt_fy2024,
                2024,
                "2024-12-31",
                "2025-02-15"
              ),
            ],
          },
        },
        ResearchAndDevelopmentExpense: {
          label: "Research and Development Expense",
          units: {
            USD: [
              usdPoint(c.cik, f.rd_fy2024, 2024, "2024-12-31", "2025-02-15"),
            ],
          },
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          label: "Capital Expenditures",
          units: {
            USD: [
              usdPoint(c.cik, f.capex_fy2024, 2024, "2024-12-31", "2025-02-15"),
            ],
          },
        },
      },
    },
  };
}

function submissions(c: VerifiedCompanyCorpus) {
  const acc1 = accession(c.cik, 1);
  const acc2 = accession(c.cik, 2);
  const foreign = Boolean(c.foreign_issuer);
  return {
    cik: cikPath(c.cik),
    entityType: "operating",
    sic: "7370",
    sicDescription: "Technology / Communications / Consumer",
    name: c.registrant,
    tickers: [c.ticker],
    exchanges: [c.exchange === "NASDAQ" ? "Nasdaq" : "NYSE"],
    formerNames: [],
    provenance_class: PROVENANCE_CLASS,
    verified_corpus_version: VERIFIED_CORPUS_VERSION,
    filings: {
      recent: {
        accessionNumber: [acc1, acc2],
        filingDate: ["2025-02-15", "2025-05-01"],
        reportDate: ["2024-12-31", "2025-03-31"],
        form: [foreign ? "20-F" : "10-K", foreign ? "6-K" : "10-Q"],
        primaryDocument: [
          `${c.ticker.toLowerCase()}-20241231.htm`,
          `${c.ticker.toLowerCase()}-20250331.htm`,
        ],
        isXBRL: [1, 1],
      },
    },
  };
}

function main() {
  for (const sub of ["submissions", "companyfacts", "filings", "documents"]) {
    mkdirSync(join(OUT, sub), { recursive: true });
  }

  const index: Record<string, unknown> = {
    generated_at: "2026-07-31T00:00:00.000Z",
    note: "Independent offline SEC-like fixtures for Phase 3.5. Not derived from Phase-2 curated pilot JSON. Not full EDGAR archives.",
    provenance_class: PROVENANCE_CLASS,
    verified_corpus_version: VERIFIED_CORPUS_VERSION,
    companies: {},
  };

  for (const c of VERIFIED_CORPUS) {
    const form = c.foreign_issuer ? "20-F" : "10-K";
    const acc = accession(c.cik, 1);
    const doc = businessHtml(c);

    writeFileSync(
      join(OUT, "submissions", `CIK${c.cik}.json`),
      JSON.stringify(submissions(c), null, 2) + "\n"
    );
    writeFileSync(
      join(OUT, "companyfacts", `CIK${c.cik}.json`),
      JSON.stringify(companyFacts(c), null, 2) + "\n"
    );
    const filingMeta = {
      company_key: c.company_key,
      cik: c.cik,
      accession_number: acc,
      form,
      filing_date: "2025-02-15",
      report_date: "2024-12-31",
      primary_document: `${c.ticker.toLowerCase()}-20241231.htm`,
      is_amendment: false,
      provenance_class: PROVENANCE_CLASS,
    };
    writeFileSync(
      join(OUT, "filings", `${c.company_key}-${acc}.json`),
      JSON.stringify(filingMeta, null, 2) + "\n"
    );
    writeFileSync(join(OUT, "documents", `${c.company_key}-${acc}.htm`), doc);

    (index.companies as Record<string, unknown>)[c.company_key] = {
      cik: c.cik,
      ticker: c.ticker,
      submissions: `submissions/CIK${c.cik}.json`,
      companyfacts: `companyfacts/CIK${c.cik}.json`,
      annual_filing: `filings/${c.company_key}-${acc}.json`,
      annual_document: `documents/${c.company_key}-${acc}.htm`,
      content_hash: createHash("sha256").update(doc).digest("hex"),
      provenance_class: PROVENANCE_CLASS,
    };
  }

  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  writeFileSync(
    join(ROOT, "data/verified/README.md"),
    `# Verified offline SEC corpus

- \`provenance_class\`: \`${PROVENANCE_CLASS}\`
- \`verified_corpus_version\`: \`${VERIFIED_CORPUS_VERSION}\`
- Source of truth: \`src/verified/independent-corpus.ts\`
- Generator: \`scripts/generate-verified-sec-fixtures.ts\`

These fixtures are **not** generated from Phase-2 \`data/pilot/business-segments.json\` or \`operating-models.json\`.
They are still compact offline stand-ins (not full EDGAR archives), but they break circular verification.

Deprecated circular fixtures remain at \`data/fixtures/sec/\` for historical Phase-3 regression only.
`
  );
  console.log(
    `Wrote verified SEC fixtures for ${VERIFIED_CORPUS.length} companies to ${OUT}`
  );
}

main();
