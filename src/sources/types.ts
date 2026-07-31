export interface PilotCompanyRef {
  company_key: string;
  legal_name: string;
  display_name: string;
  ticker: string;
  exchange: string;
  cik: string | null;
}

export interface ResolvedCompanyIdentifiers {
  company_key: string;
  configured_name: string;
  configured_ticker: string;
  resolved_cik: string | null;
  resolved_registrant: string | null;
  exchange: string | null;
  foreign_issuer: boolean;
  identifier_confidence: number;
  status: "resolved" | "ambiguous" | "missing" | "conflict";
  discrepancy: string | null;
  former_names: string[];
}

export interface FilingMetadata {
  company_key: string;
  cik: string;
  accession_number: string;
  form: string;
  filing_date: string;
  report_date: string | null;
  primary_document: string;
  is_amendment: boolean;
  original_uri: string;
}

export interface RawSourcePayload {
  source_type: string;
  source_identifier: string;
  company_key: string;
  cik: string | null;
  content_type: string;
  content: string | Buffer;
  original_uri: string;
  accession_number?: string | null;
  filing_form?: string | null;
  filing_date?: string | null;
  reporting_period?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RawSourceDocument extends RawSourcePayload {
  accession_number: string;
  filing_form: string;
  filing_date: string;
}

export interface RegulatorySourceAdapter {
  readonly name: string;
  readonly version: string;
  resolveCompanyIdentifiers(
    company: PilotCompanyRef
  ): Promise<ResolvedCompanyIdentifiers>;
  fetchSubmissionHistory(
    company: ResolvedCompanyIdentifiers
  ): Promise<RawSourcePayload>;
  fetchStructuredFinancialFacts(
    company: ResolvedCompanyIdentifiers
  ): Promise<RawSourcePayload>;
  listRelevantFilings(
    company: ResolvedCompanyIdentifiers
  ): Promise<FilingMetadata[]>;
  fetchFilingDocument(filing: FilingMetadata): Promise<RawSourceDocument>;
}
