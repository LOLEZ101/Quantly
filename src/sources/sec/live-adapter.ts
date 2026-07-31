import { loadEnvConfig } from "../../database/env.js";
import { readCachedPayload, cacheRawPayload } from "../raw-cache.js";
import { OfflineSecAdapter } from "./offline-adapter.js";
import type {
  FilingMetadata,
  PilotCompanyRef,
  RawSourceDocument,
  RawSourcePayload,
  RegulatorySourceAdapter,
  ResolvedCompanyIdentifiers,
} from "../types.js";

export interface LiveSecAdapterOptions {
  /**
   * When false (Phase 3.7 strict), never fall back to offline fixtures.
   * Fail the request instead.
   */
  allowOfflineFallback?: boolean;
  /** Ignore cache entries that are not from data.sec.gov. */
  requireLiveCacheUri?: boolean;
  corpus?: "legacy_circular" | "verified_independent";
}

/**
 * Live SEC EDGAR adapter with throttling, retries, and cache reuse.
 */
export class LiveSecAdapter implements RegulatorySourceAdapter {
  readonly name = "sec-edgar-live";
  readonly version = "1.1.0";
  private readonly offline: OfflineSecAdapter;
  private readonly allowOfflineFallback: boolean;
  private readonly requireLiveCacheUri: boolean;
  private lastRequestAt = 0;

  constructor(options: LiveSecAdapterOptions = {}) {
    this.offline = new OfflineSecAdapter(
      options.corpus ?? "verified_independent"
    );
    this.allowOfflineFallback = options.allowOfflineFallback ?? true;
    this.requireLiveCacheUri = options.requireLiveCacheUri ?? false;
  }

  private async throttle(): Promise<void> {
    const env = loadEnvConfig();
    const wait = env.ingestionDelayMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();
  }

  private headers(): Record<string, string> {
    const env = loadEnvConfig();
    if (!env.secContactEmail) {
      throw new Error(
        "SEC_CONTACT_EMAIL is required for live SEC requests. Set it in .env."
      );
    }
    return {
      "User-Agent": env.secUserAgent,
      Accept: "application/json,text/html,*/*",
    };
  }

  private async fetchText(url: string): Promise<string> {
    const env = loadEnvConfig();
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= env.maxRetries) {
      await this.throttle();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), env.requestTimeoutMs);
        const res = await fetch(url, {
          headers: this.headers(),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) {
          attempt++;
          await new Promise((r) =>
            setTimeout(r, env.ingestionDelayMs * 2 ** attempt)
          );
          continue;
        }
        if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${url}`);
        return await res.text();
      } catch (err) {
        lastError = err;
        attempt++;
        await new Promise((r) =>
          setTimeout(r, env.ingestionDelayMs * 2 ** attempt)
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`SEC fetch failed for ${url}: ${String(lastError)}`);
  }

  private liveCached(
    sourceType: string,
    sourceIdentifier: string
  ): { record: ReturnType<typeof readCachedPayload> extends infer R ? R : never; content: Buffer } | null {
    const cached = readCachedPayload(sourceType, sourceIdentifier);
    if (!cached) return null;
    if (
      this.requireLiveCacheUri &&
      !cached.record.original_uri.includes("data.sec.gov")
    ) {
      return null;
    }
    return cached as never;
  }

  private async fallbackOrThrow<T>(
    label: string,
    offlineFn: () => Promise<T>
  ): Promise<T> {
    if (!this.allowOfflineFallback) {
      throw new Error(
        `Live SEC required for ${label}; offline fallback disabled (Phase 3.7 strict mode)`
      );
    }
    return offlineFn();
  }

  async resolveCompanyIdentifiers(
    company: PilotCompanyRef
  ): Promise<ResolvedCompanyIdentifiers> {
    const cik = company.cik;
    if (!cik) {
      return this.fallbackOrThrow("resolveCompanyIdentifiers", () =>
        this.offline.resolveCompanyIdentifiers(company)
      );
    }

    const padded = cik.padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
    try {
      let text: string;
      const cached = this.liveCached("submissions", `CIK${padded}`);
      if (cached) {
        text = cached.content.toString("utf8");
      } else {
        text = await this.fetchText(url);
        cacheRawPayload({
          source_type: "submissions",
          source_identifier: `CIK${padded}`,
          company_key: company.company_key,
          cik: padded,
          content_type: "application/json",
          content: text,
          original_uri: url,
        });
      }
      const submissions = JSON.parse(text) as {
        name?: string;
        tickers?: string[];
        exchanges?: string[];
        formerNames?: Array<{ name: string }>;
      };
      const tickerMatch = (submissions.tickers ?? [])
        .map((t) => t.toUpperCase())
        .includes(company.ticker.toUpperCase());
      return {
        company_key: company.company_key,
        configured_name: company.legal_name,
        configured_ticker: company.ticker,
        resolved_cik: padded,
        resolved_registrant: submissions.name ?? company.legal_name,
        exchange: submissions.exchanges?.[0] ?? company.exchange,
        foreign_issuer: ["nxpi", "gfs"].includes(company.company_key),
        identifier_confidence: tickerMatch ? 0.98 : 0.7,
        status: tickerMatch ? "resolved" : "conflict",
        discrepancy: tickerMatch
          ? null
          : `Configured ticker ${company.ticker} not in SEC tickers ${(submissions.tickers ?? []).join(",")}`,
        former_names: (submissions.formerNames ?? []).map((f) => f.name),
      };
    } catch (err) {
      if (!this.allowOfflineFallback) throw err;
      return this.offline.resolveCompanyIdentifiers(company);
    }
  }

  async fetchSubmissionHistory(
    company: ResolvedCompanyIdentifiers
  ): Promise<RawSourcePayload> {
    if (!company.resolved_cik) {
      return this.fallbackOrThrow("fetchSubmissionHistory", () =>
        this.offline.fetchSubmissionHistory(company)
      );
    }
    const cik = company.resolved_cik.padStart(10, "0");
    const cached = this.liveCached("submissions", `CIK${cik}`);
    if (cached) {
      return {
        source_type: "submissions",
        source_identifier: `CIK${cik}`,
        company_key: company.company_key,
        cik,
        content_type: "application/json",
        content: cached.content,
        original_uri: cached.record.original_uri,
      };
    }
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    try {
      const text = await this.fetchText(url);
      const payload: RawSourcePayload = {
        source_type: "submissions",
        source_identifier: `CIK${cik}`,
        company_key: company.company_key,
        cik,
        content_type: "application/json",
        content: text,
        original_uri: url,
      };
      cacheRawPayload(payload);
      return payload;
    } catch (err) {
      if (!this.allowOfflineFallback) throw err;
      return this.offline.fetchSubmissionHistory(company);
    }
  }

  async fetchStructuredFinancialFacts(
    company: ResolvedCompanyIdentifiers
  ): Promise<RawSourcePayload> {
    if (!company.resolved_cik) {
      return this.fallbackOrThrow("fetchStructuredFinancialFacts", () =>
        this.offline.fetchStructuredFinancialFacts(company)
      );
    }
    const cik = company.resolved_cik.padStart(10, "0");
    const cached = this.liveCached("companyfacts", `CIK${cik}`);
    if (cached) {
      return {
        source_type: "companyfacts",
        source_identifier: `CIK${cik}`,
        company_key: company.company_key,
        cik,
        content_type: "application/json",
        content: cached.content,
        original_uri: cached.record.original_uri,
      };
    }
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    try {
      const text = await this.fetchText(url);
      const payload: RawSourcePayload = {
        source_type: "companyfacts",
        source_identifier: `CIK${cik}`,
        company_key: company.company_key,
        cik,
        content_type: "application/json",
        content: text,
        original_uri: url,
      };
      cacheRawPayload(payload);
      return payload;
    } catch (err) {
      if (!this.allowOfflineFallback) throw err;
      return this.offline.fetchStructuredFinancialFacts(company);
    }
  }

  async listRelevantFilings(
    company: ResolvedCompanyIdentifiers
  ): Promise<FilingMetadata[]> {
    // Filing document HTML still uses offline verified excerpts for section extraction.
    // Live companyfacts/submissions are the official financial authority in Phase 3.7.
    return this.offline.listRelevantFilings(company);
  }

  async fetchFilingDocument(
    filing: FilingMetadata
  ): Promise<RawSourceDocument> {
    const cached = this.liveCached("documents", filing.accession_number);
    if (cached) {
      return {
        source_type: "documents",
        source_identifier: filing.accession_number,
        company_key: filing.company_key,
        cik: filing.cik,
        content_type: cached.record.content_type,
        content: cached.content,
        original_uri: cached.record.original_uri,
        accession_number: filing.accession_number,
        filing_form: filing.form,
        filing_date: filing.filing_date,
        reporting_period: filing.report_date,
      };
    }
    if (!this.allowOfflineFallback) {
      // Strict mode still allows offline HTML for section extraction when live
      // companyfacts have already been fetched — document that in metadata.
      const doc = await this.offline.fetchFilingDocument(filing);
      return {
        ...doc,
        metadata: {
          ...(doc.metadata ?? {}),
          html_source: "offline_verified_excerpt",
          note: "Phase 3.7 uses live companyfacts; filing HTML may remain offline excerpt",
        },
      };
    }
    return this.offline.fetchFilingDocument(filing);
  }
}

export function createSecAdapter(
  offline: boolean,
  options: {
    corpus?: "legacy_circular" | "verified_independent";
    allowOfflineFallback?: boolean;
    requireLiveCacheUri?: boolean;
  } = {}
): RegulatorySourceAdapter {
  const corpus = options.corpus ?? "legacy_circular";
  if (offline) return new OfflineSecAdapter(corpus);
  return new LiveSecAdapter({
    corpus,
    allowOfflineFallback: options.allowOfflineFallback ?? true,
    requireLiveCacheUri: options.requireLiveCacheUri ?? false,
  });
}
