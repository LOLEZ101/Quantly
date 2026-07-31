import { describe, expect, it } from "vitest";
import { loadPilotData } from "../../src/config/load-pilot-universe.js";
import { loadThresholds } from "../../src/config/load-thresholds.js";
import { validatePilotFixtures } from "../../src/validation/validate-fixtures.js";

describe("Phase-2 pilot fixtures", () => {
  const data = loadPilotData();
  const thresholds = loadThresholds();
  const result = validatePilotFixtures(data, thresholds);

  it("validates without errors", () => {
    expect(result.errors).toEqual([]);
  });

  it("has unique company ids and tickers", () => {
    const keys = data.companies.map((c) => c.company_key);
    const tickers = data.companies.map((c) => c.ticker);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("labels data quality on segments and evidence", () => {
    for (const s of data.segments) {
      expect([
        "reported",
        "derived",
        "manually_classified",
        "illustrative",
      ]).toContain(s.quality);
    }
    for (const e of data.evidence) {
      expect(e.evidence_id).toMatch(/^ev_/);
      expect(data.companies.some((c) => c.company_key === e.company_key)).toBe(
        true
      );
    }
  });

  it("keeps coverage ratios valid", () => {
    for (const c of data.coverage) {
      expect(c.coverage_ratio).toBeGreaterThanOrEqual(0);
      expect(c.coverage_ratio).toBeLessThanOrEqual(1.01);
      expect(c.unallocated_weight).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it("includes S&P 500 membership status for every company", () => {
    for (const c of data.companies) {
      expect(["member", "not_member", "unknown"]).toContain(
        c.sp500_membership_status
      );
    }
  });
});
