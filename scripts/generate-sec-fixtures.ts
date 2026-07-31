/**
 * DEPRECATED (Phase 3.5): Circular fixture generator.
 *
 * This script builds `data/fixtures/sec/**` from Phase-2 curated
 * `business-segments.json` / `operating-models.json`. Offline Phase-3
 * evidence that relied on those fixtures was circular.
 *
 * Prefer: `npm run fixtures:verified` → `data/verified/sec/`
 * (`scripts/generate-verified-sec-fixtures.ts`).
 *
 * Kept only for historical Phase-3 regression. Do not use for verified publication.
 */
import { stderr } from "node:process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data/fixtures/sec");

interface Company {
  company_key: string;
  legal_name: string;
  display_name: string;
  ticker: string;
  exchange: string;
  cik: string | null;
}

const companies = (
  JSON.parse(readFileSync(join(ROOT, "data/pilot/companies.json"), "utf8")) as {
    companies: Company[];
  }
).companies;

const segments = (
  JSON.parse(
    readFileSync(join(ROOT, "data/pilot/business-segments.json"), "utf8")
  ) as { segments: Array<{ company_key: string; segment_name: string; reported_weight: number; node_id: string | null }> }
).segments;

const operating = (
  JSON.parse(
    readFileSync(join(ROOT, "data/pilot/operating-models.json"), "utf8")
  ) as {
    models: Array<{
      company_key: string;
      franchise_mix?: { locations_franchised_pct?: { value: number | null } };
      semiconductor_model?: { model_code: string };
      infrastructure_models: Array<{ model_code: string; model_name: string }>;
    }>;
  }
).models;

function cikPath(cik: string): string {
  return cik.replace(/^0+/, "") || "0";
}

function accession(cik: string, seq: number): string {
  const n = cikPath(cik).padStart(10, "0");
  return `${n.slice(0, 10)}-24-000${seq}`;
}

function businessText(c: Company): string {
  const segs = segments.filter((s) => s.company_key === c.company_key);
  const op = operating.find((o) => o.company_key === c.company_key);
  const segLines = segs
    .map((s) => `${s.segment_name} (${Math.round(s.reported_weight * 100)}% of revenue)`)
    .join("; ");
  const franchise = op?.franchise_mix?.locations_franchised_pct?.value;
  const semi = op?.semiconductor_model?.model_code;
  const infra = op?.infrastructure_models.map((m) => m.model_name).join(", ");

  let competition = "We compete with other companies in our industry.";
  if (["vz", "t", "tmus"].includes(c.company_key)) {
    competition =
      "We compete with other nationwide wireless carriers including AT&T, T-Mobile, and Verizon depending on market, as well as cable broadband providers for connectivity services.";
  } else if (["mcd", "yum", "qsr", "dpz"].includes(c.company_key)) {
    competition =
      "We compete with other quick-service and limited-service restaurant brands, including McDonald's, Yum! Brands concepts, Restaurant Brands International brands, Domino's, and fast-casual competitors.";
  } else if (["nvda", "amd", "intc"].includes(c.company_key)) {
    competition =
      "We compete with other semiconductor designers and manufacturers, including AMD, NVIDIA, and Intel in compute and related markets. We do not compete with semiconductor equipment suppliers as peers in product markets.";
  } else if (["amt", "cci"].includes(c.company_key)) {
    competition =
      "We lease communications sites to wireless carriers. We compete with other tower and infrastructure owners such as American Tower and Crown Castle, and are not a retail wireless network operator.";
  }

  const franchiseLine =
    franchise == null
      ? ""
      : `<p>As of year end, approximately ${Math.round(
          franchise * 100
        )}% of system restaurants were franchised and the remainder were company-operated.</p>`;

  const modelLine = semi
    ? `<p>Our semiconductor business model is ${semi}. ${
        semi === "fabless"
          ? "We design semiconductors and outsource manufacturing to foundries."
          : semi === "idm"
            ? "We design and manufacture semiconductors in captive fabrication facilities and also describe foundry services initiatives."
            : semi === "foundry"
              ? "We operate as a pure-play foundry manufacturing wafers for third-party designers."
              : semi === "equipment"
                ? "We supply wafer fabrication equipment to semiconductor manufacturers."
                : "We produce analog and mixed-signal devices."
      }</p>`
    : infra
      ? `<p>Our infrastructure/operating model includes: ${infra}.</p>`
      : "";

  return `<html><body>
<a id="item1"></a><h1>Item 1. Business</h1>
<p>${c.legal_name} (${c.ticker}) is a registrant under the Securities Exchange Act.</p>
<p>Principal operations: ${c.display_name}. Reported segments include: ${segLines}.</p>
${modelLine}
${franchiseLine}
<a id="item1a"></a><h1>Item 1A. Risk Factors</h1>
<p>Our business is subject to competitive, regulatory, and technology risks.</p>
<a id="competition"></a><h2>Competition</h2>
<p>${competition}</p>
<a id="segments"></a><h1>Notes to Financial Statements — Segment Information</h1>
<p>Revenue by segment: ${segLines}.</p>
<a id="geographic"></a><h2>Geographic Information</h2>
<p>We generate revenue primarily in the United States and other international markets.</p>
</body></html>`;
}

function companyFacts(c: Company) {
  const segs = segments.filter((s) => s.company_key === c.company_key);
  const revenue = 50_000_000_000 + segs.length * 1_000_000_000;
  const opex = revenue * 0.2;
  const facts: Record<string, unknown> = {
    entityName: c.legal_name,
    cik: cikPath(c.cik ?? "0"),
    facts: {
      "us-gaap": {
        Revenues: {
          label: "Revenues",
          units: {
            USD: [
              {
                end: "2024-12-31",
                val: revenue,
                accn: accession(c.cik ?? "0", 1),
                fy: 2024,
                fp: "FY",
                form: "10-K",
                filed: "2025-02-15",
                frame: "CY2024",
              },
            ],
          },
        },
        OperatingIncomeLoss: {
          label: "Operating Income (Loss)",
          units: {
            USD: [
              {
                end: "2024-12-31",
                val: opex,
                accn: accession(c.cik ?? "0", 1),
                fy: 2024,
                fp: "FY",
                form: "10-K",
                filed: "2025-02-15",
                frame: "CY2024",
              },
            ],
          },
        },
        Assets: {
          label: "Assets",
          units: {
            USD: [
              {
                end: "2024-12-31",
                val: revenue * 2,
                accn: accession(c.cik ?? "0", 1),
                fy: 2024,
                fp: "FY",
                form: "10-K",
                filed: "2025-02-15",
              },
            ],
          },
        },
        LongTermDebt: {
          label: "Long-term Debt",
          units: {
            USD: [
              {
                end: "2024-12-31",
                val: revenue * 0.4,
                accn: accession(c.cik ?? "0", 1),
                fy: 2024,
                fp: "FY",
                form: "10-K",
                filed: "2025-02-15",
              },
            ],
          },
        },
        ResearchAndDevelopmentExpense: {
          label: "Research and Development Expense",
          units: {
            USD: [
              {
                end: "2024-12-31",
                val: ["nvda", "amd", "intc", "avgo", "qcom"].includes(c.company_key)
                  ? revenue * 0.15
                  : revenue * 0.02,
                accn: accession(c.cik ?? "0", 1),
                fy: 2024,
                fp: "FY",
                form: "10-K",
                filed: "2025-02-15",
              },
            ],
          },
        },
      },
    },
  };
  return facts;
}

function submissions(c: Company) {
  const cik = c.cik ?? "0000000000";
  const acc1 = accession(cik, 1);
  const acc2 = accession(cik, 2);
  const foreign = ["nxpi", "gfs"].includes(c.company_key);
  return {
    cik: cikPath(cik),
    entityType: "operating",
    sic: "4812",
    sicDescription: "Communications / Technology",
    name: c.legal_name,
    tickers: [c.ticker],
    exchanges: [c.exchange === "NASDAQ" ? "Nasdaq" : "NYSE"],
    formerNames: [],
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
  stderr.write(
    "WARNING: generate-sec-fixtures.ts is DEPRECATED (circular Phase-2 derivation). Use fixtures:verified for Phase 3.5.\n"
  );
  for (const sub of ["submissions", "companyfacts", "filings", "documents"]) {
    mkdirSync(join(OUT, sub), { recursive: true });
  }

  const index: Record<string, unknown> = {
    generated_at: "2026-07-31T00:00:00.000Z",
    note: "Compact offline SEC-like fixtures for Phase-3. Not full EDGAR archives.",
    companies: {},
  };

  for (const c of companies) {
    if (!c.cik) continue;
    const cik = c.cik;
    const sub = submissions(c);
    const facts = companyFacts(c);
    const doc = businessText(c);
    const form = ["nxpi", "gfs"].includes(c.company_key) ? "20-F" : "10-K";
    const acc = accession(cik, 1);

    writeFileSync(
      join(OUT, "submissions", `CIK${cik}.json`),
      JSON.stringify(sub, null, 2) + "\n"
    );
    writeFileSync(
      join(OUT, "companyfacts", `CIK${cik}.json`),
      JSON.stringify(facts, null, 2) + "\n"
    );
    const filingMeta = {
      company_key: c.company_key,
      cik,
      accession_number: acc,
      form,
      filing_date: "2025-02-15",
      report_date: "2024-12-31",
      primary_document: `${c.ticker.toLowerCase()}-20241231.htm`,
      is_amendment: false,
    };
    writeFileSync(
      join(OUT, "filings", `${c.company_key}-${acc}.json`),
      JSON.stringify(filingMeta, null, 2) + "\n"
    );
    writeFileSync(
      join(OUT, "documents", `${c.company_key}-${acc}.htm`),
      doc
    );

    (index.companies as Record<string, unknown>)[c.company_key] = {
      cik,
      ticker: c.ticker,
      submissions: `submissions/CIK${cik}.json`,
      companyfacts: `companyfacts/CIK${cik}.json`,
      annual_filing: `filings/${c.company_key}-${acc}.json`,
      annual_document: `documents/${c.company_key}-${acc}.htm`,
      content_hash: createHash("sha256").update(doc).digest("hex"),
    };
  }

  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote SEC fixtures for ${companies.length} companies to ${OUT}`);
}

main();
