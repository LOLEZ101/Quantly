import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../../config/paths.js";
import type {
  FilingMetadata,
  PilotCompanyRef,
  RawSourceDocument,
  RawSourcePayload,
  RegulatorySourceAdapter,
  ResolvedCompanyIdentifiers,
} from "../types.js";

export type OfflineCorpusKind = "legacy_circular" | "verified_independent";

export class OfflineSecAdapter implements RegulatorySourceAdapter {
  readonly name = "sec-edgar-offline";
  readonly version = "1.1.0";
  private readonly root: string;
  readonly corpusKind: OfflineCorpusKind;

  constructor(corpus: OfflineCorpusKind = "legacy_circular") {
    this.corpusKind = corpus;
    this.root =
      corpus === "verified_independent"
        ? repoPath("data/verified/sec")
        : repoPath("data/fixtures/sec");
  }

  private index() {
    return JSON.parse(
      readFileSync(join(this.root, "index.json"), "utf8")
    ) as {
      provenance_class?: string;
      companies: Record<
        string,
        {
          cik: string;
          ticker: string;
          submissions: string;
          companyfacts: string;
          annual_filing: string;
          annual_document: string;
          provenance_class?: string;
        }
      >;
    };
  }

  provenanceClass(): string | null {
    const idx = this.index();
    return idx.provenance_class ?? null;
  }

  async resolveCompanyIdentifiers(
    company: PilotCompanyRef
  ): Promise<ResolvedCompanyIdentifiers> {
    const idx = this.index().companies[company.company_key];
    if (!idx) {
      return {
        company_key: company.company_key,
        configured_name: company.legal_name,
        configured_ticker: company.ticker,
        resolved_cik: null,
        resolved_registrant: null,
        exchange: company.exchange,
        foreign_issuer: false,
        identifier_confidence: 0,
        status: "missing",
        discrepancy: "No offline SEC fixture for company",
        former_names: [],
      };
    }

    const submissions = JSON.parse(
      readFileSync(join(this.root, idx.submissions), "utf8")
    ) as {
      name: string;
      tickers: string[];
      exchanges: string[];
      formerNames: Array<{ name: string }>;
    };

    const tickerMatch = submissions.tickers
      .map((t) => t.toUpperCase())
      .includes(company.ticker.toUpperCase());
    const cikMatch =
      !company.cik || company.cik.replace(/^0+/, "") === idx.cik.replace(/^0+/, "");

    let status: ResolvedCompanyIdentifiers["status"] = "resolved";
    let discrepancy: string | null = null;
    let confidence = 0.95;
    if (!tickerMatch) {
      status = "conflict";
      discrepancy = `Configured ticker ${company.ticker} not in SEC tickers ${submissions.tickers.join(",")}`;
      confidence = 0.4;
    } else if (!cikMatch) {
      status = "conflict";
      discrepancy = `Configured CIK ${company.cik} differs from fixture CIK ${idx.cik}`;
      confidence = 0.5;
    }

    return {
      company_key: company.company_key,
      configured_name: company.legal_name,
      configured_ticker: company.ticker,
      resolved_cik: idx.cik,
      resolved_registrant: submissions.name,
      exchange: submissions.exchanges[0] ?? company.exchange,
      foreign_issuer: ["nxpi", "gfs"].includes(company.company_key),
      identifier_confidence: confidence,
      status,
      discrepancy,
      former_names: (submissions.formerNames ?? []).map((f) => f.name),
    };
  }

  async fetchSubmissionHistory(
    company: ResolvedCompanyIdentifiers
  ): Promise<RawSourcePayload> {
    const idx = this.index().companies[company.company_key];
    if (!idx) throw new Error(`Missing submissions fixture for ${company.company_key}`);
    const content = readFileSync(join(this.root, idx.submissions));
    return {
      source_type: "submissions",
      source_identifier: `CIK${idx.cik}`,
      company_key: company.company_key,
      cik: idx.cik,
      content_type: "application/json",
      content,
      original_uri: `fixture://sec/${idx.submissions}`,
    };
  }

  async fetchStructuredFinancialFacts(
    company: ResolvedCompanyIdentifiers
  ): Promise<RawSourcePayload> {
    const idx = this.index().companies[company.company_key];
    if (!idx) throw new Error(`Missing companyfacts fixture for ${company.company_key}`);
    const content = readFileSync(join(this.root, idx.companyfacts));
    return {
      source_type: "companyfacts",
      source_identifier: `CIK${idx.cik}`,
      company_key: company.company_key,
      cik: idx.cik,
      content_type: "application/json",
      content,
      original_uri: `fixture://sec/${idx.companyfacts}`,
    };
  }

  async listRelevantFilings(
    company: ResolvedCompanyIdentifiers
  ): Promise<FilingMetadata[]> {
    const idx = this.index().companies[company.company_key];
    if (!idx) return [];
    const filingPath = join(this.root, idx.annual_filing);
    if (!existsSync(filingPath)) return [];
    const filing = JSON.parse(readFileSync(filingPath, "utf8")) as FilingMetadata;
    const quarterly: FilingMetadata = {
      ...filing,
      accession_number: filing.accession_number.replace(/0001$/, "0002"),
      form: company.foreign_issuer ? "6-K" : "10-Q",
      filing_date: "2025-05-01",
      report_date: "2025-03-31",
      primary_document: filing.primary_document.replace("20241231", "20250331"),
      original_uri: `fixture://sec/filings/${company.company_key}-q.json`,
    };
    return [
      { ...filing, original_uri: `fixture://sec/${idx.annual_filing}` },
      quarterly,
    ];
  }

  async fetchFilingDocument(
    filing: FilingMetadata
  ): Promise<RawSourceDocument> {
    const idx = this.index().companies[filing.company_key];
    if (!idx) throw new Error(`Missing document for ${filing.company_key}`);
    // Use annual document fixture for both annual/quarterly in offline mode
    const content = readFileSync(join(this.root, idx.annual_document));
    return {
      source_type: "documents",
      source_identifier: filing.accession_number,
      company_key: filing.company_key,
      cik: filing.cik,
      content_type: "text/html",
      content,
      original_uri: `fixture://sec/${idx.annual_document}`,
      accession_number: filing.accession_number,
      filing_form: filing.form,
      filing_date: filing.filing_date,
      reporting_period: filing.report_date,
    };
  }
}
