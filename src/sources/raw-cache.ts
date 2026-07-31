import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { repoPath } from "../config/paths.js";
import { loadEnvConfig } from "../database/env.js";
import type { RawSourcePayload } from "./types.js";

export interface CachedSourceRecord {
  source_type: string;
  source_identifier: string;
  company_key: string;
  cik: string | null;
  content_hash: string;
  storage_uri: string;
  original_uri: string;
  content_type: string;
  byte_size: number;
  retrieved_at: string;
  accession_number?: string | null;
  filing_form?: string | null;
  filing_date?: string | null;
  reporting_period?: string | null;
  metadata?: Record<string, unknown>;
}

function rawRoot(): string {
  return repoPath(loadEnvConfig().rawDataDir, "sec");
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function cacheRawPayload(
  payload: RawSourcePayload,
  processingRunId?: string
): CachedSourceRecord {
  const hash = sha256(payload.content);
  const dir = join(rawRoot(), payload.source_type);
  mkdirSync(dir, { recursive: true });
  const safeId = payload.source_identifier.replace(/[^a-zA-Z0-9._-]/g, "_");
  const bodyPath = join(dir, `${safeId}.${hash.slice(0, 16)}.bin`);
  const metaPath = join(dir, `${safeId}.${hash.slice(0, 16)}.meta.json`);

  if (!existsSync(bodyPath)) {
    writeFileSync(bodyPath, payload.content);
  }

  const record: CachedSourceRecord = {
    source_type: payload.source_type,
    source_identifier: payload.source_identifier,
    company_key: payload.company_key,
    cik: payload.cik,
    content_hash: hash,
    storage_uri: bodyPath,
    original_uri: payload.original_uri,
    content_type: payload.content_type,
    byte_size: Buffer.byteLength(payload.content),
    retrieved_at: "2026-07-31T00:00:00.000Z",
    accession_number: payload.accession_number,
    filing_form: payload.filing_form,
    filing_date: payload.filing_date,
    reporting_period: payload.reporting_period,
    metadata: {
      ...(payload.metadata ?? {}),
      processing_run_id: processingRunId ?? null,
    },
  };

  if (!existsSync(metaPath)) {
    writeFileSync(metaPath, JSON.stringify(record, null, 2) + "\n");
  }
  return record;
}

export function readCachedPayload(
  sourceType: string,
  sourceIdentifier: string
): { record: CachedSourceRecord; content: Buffer } | null {
  const dir = join(rawRoot(), sourceType);
  if (!existsSync(dir)) return null;
  const safeId = sourceIdentifier.replace(/[^a-zA-Z0-9._-]/g, "_");
  const metas = readdirSync(dir).filter(
    (f) => f.startsWith(`${safeId}.`) && f.endsWith(".meta.json")
  );
  if (!metas.length) return null;
  metas.sort();
  const record = JSON.parse(
    readFileSync(join(dir, metas[metas.length - 1]), "utf8")
  ) as CachedSourceRecord;
  const content = readFileSync(record.storage_uri);
  return { record, content };
}

export function seedRawCacheFromFixtures(
  corpus: "legacy_circular" | "verified_independent" = "legacy_circular"
): number {
  const fixtureRoot =
    corpus === "verified_independent"
      ? repoPath("data/verified/sec")
      : repoPath("data/fixtures/sec");
  const index = JSON.parse(
    readFileSync(join(fixtureRoot, "index.json"), "utf8")
  ) as {
    companies: Record<
      string,
      {
        cik: string;
        submissions: string;
        companyfacts: string;
        annual_filing: string;
        annual_document: string;
      }
    >;
  };

  let count = 0;
  for (const [companyKey, refs] of Object.entries(index.companies)) {
    const sub = readFileSync(join(fixtureRoot, refs.submissions));
    cacheRawPayload({
      source_type: "submissions",
      source_identifier: `CIK${refs.cik}`,
      company_key: companyKey,
      cik: refs.cik,
      content_type: "application/json",
      content: sub,
      original_uri: `fixture://sec/submissions/CIK${refs.cik}.json`,
    });
    count++;

    const facts = readFileSync(join(fixtureRoot, refs.companyfacts));
    cacheRawPayload({
      source_type: "companyfacts",
      source_identifier: `CIK${refs.cik}`,
      company_key: companyKey,
      cik: refs.cik,
      content_type: "application/json",
      content: facts,
      original_uri: `fixture://sec/companyfacts/CIK${refs.cik}.json`,
    });
    count++;

    const filing = JSON.parse(
      readFileSync(join(fixtureRoot, refs.annual_filing), "utf8")
    ) as {
      accession_number: string;
      form: string;
      filing_date: string;
      report_date: string;
    };
    const doc = readFileSync(join(fixtureRoot, refs.annual_document));
    cacheRawPayload({
      source_type: "documents",
      source_identifier: filing.accession_number,
      company_key: companyKey,
      cik: refs.cik,
      content_type: "text/html",
      content: doc,
      original_uri: `fixture://sec/${refs.annual_document}`,
      accession_number: filing.accession_number,
      filing_form: filing.form,
      filing_date: filing.filing_date,
      reporting_period: filing.report_date,
    });
    count++;
  }
  return count;
}
