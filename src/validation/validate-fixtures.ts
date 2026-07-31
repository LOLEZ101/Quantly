import type { PilotData } from "../config/load-pilot-universe.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";

const QUALITIES = new Set([
  "reported",
  "derived",
  "manually_classified",
  "illustrative",
]);

export function validatePilotFixtures(
  data: PilotData,
  thresholds: ClassificationThresholds
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const keys = data.companies.map((c) => c.company_key);
  if (new Set(keys).size !== keys.length) errors.push("Duplicate company_key");
  const tickers = data.companies.map((c) => c.ticker);
  if (new Set(tickers).size !== tickers.length) errors.push("Duplicate ticker");

  for (const key of data.universe.company_keys) {
    if (!keys.includes(key)) errors.push(`Universe key missing company fixture: ${key}`);
  }

  const evidenceIds = new Set(data.evidence.map((e) => e.evidence_id));
  if (evidenceIds.size !== data.evidence.length) errors.push("Duplicate evidence_id");

  for (const seg of data.segments) {
    if (seg.reported_weight < 0 || seg.reported_weight > 1) {
      errors.push(`Invalid segment weight for ${seg.company_key}/${seg.segment_key}`);
    }
    if (!QUALITIES.has(seg.quality)) {
      errors.push(`Invalid quality on segment ${seg.company_key}/${seg.segment_key}`);
    }
  }

  for (const cov of data.coverage) {
    if (cov.coverage_ratio < 0 || cov.coverage_ratio > 1.01) {
      errors.push(`Invalid coverage_ratio for ${cov.company_key}`);
    }
    if (cov.unallocated_weight < -0.01) {
      errors.push(`Invalid unallocated_weight for ${cov.company_key}`);
    }
    if (
      cov.is_complete &&
      (cov.coverage_ratio < thresholds.segment_coverage.complete_min ||
        cov.coverage_ratio > thresholds.segment_coverage.complete_max)
    ) {
      warnings.push(
        `${cov.company_key} marked complete but coverage=${cov.coverage_ratio}`
      );
    }
  }

  for (const e of data.evidence) {
    if (!keys.includes(e.company_key)) {
      errors.push(`Evidence references missing company ${e.company_key}`);
    }
    if (!QUALITIES.has(e.quality)) {
      errors.push(`Invalid evidence quality ${e.evidence_id}`);
    }
  }

  for (const f of data.financial) {
    for (const band of [
      f.size_band,
      f.revenue_growth_band,
      f.profitability_band,
      f.leverage_band,
      f.capital_intensity_band,
    ]) {
      if (!QUALITIES.has(band.quality)) {
        errors.push(`Invalid financial quality for ${f.company_key}`);
      }
    }
  }

  return { errors, warnings };
}
