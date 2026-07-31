import type { FinancialFeaturesRecord } from "../domain/types.js";
import type { NormalizedFinancialFact } from "../normalization/normalize-financial-fact.js";

function canonicalValue(
  facts: Array<NormalizedFinancialFact & { is_canonical?: boolean }>,
  metric: string,
  fiscalYear?: number
): number | null {
  const candidates = facts.filter(
    (f) =>
      f.normalized_metric === metric &&
      f.data_quality_status === "normalized" &&
      (fiscalYear == null || f.fiscal_year === fiscalYear) &&
      (f.is_canonical || f.fiscal_period === "FY" || f.frame?.startsWith("CY"))
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const ay = a.fiscal_year ?? 0;
    const by = b.fiscal_year ?? 0;
    if (ay !== by) return by - ay;
    return (b.end_date ?? "").localeCompare(a.end_date ?? "");
  });
  return candidates[0].value_numeric;
}

function sizeBand(revenue: number | null, assets: number | null): FinancialFeaturesRecord["size_band"]["value"] {
  const rev = revenue ?? 0;
  const ast = assets ?? 0;
  if (rev >= 50_000_000_000 || ast >= 100_000_000_000) return "mega";
  if (rev >= 10_000_000_000 || ast >= 30_000_000_000) return "large";
  if (rev >= 1_000_000_000 || ast >= 3_000_000_000) return "mid";
  return "small";
}

function growthBand(yoy: number | null): FinancialFeaturesRecord["revenue_growth_band"]["value"] {
  if (yoy == null) return "low";
  if (yoy >= 0.15) return "high";
  if (yoy >= 0.03) return "moderate";
  if (yoy >= 0) return "low";
  return "negative";
}

function profitabilityBand(
  margin: number | null
): FinancialFeaturesRecord["profitability_band"]["value"] {
  if (margin == null) return "low";
  if (margin >= 0.25) return "high";
  if (margin >= 0.1) return "moderate";
  if (margin >= 0) return "low";
  return "negative";
}

function leverageBand(
  ratio: number | null
): FinancialFeaturesRecord["leverage_band"]["value"] {
  if (ratio == null) return "low";
  if (ratio >= 0.5) return "high";
  if (ratio >= 0.25) return "moderate";
  return "low";
}

function capitalIntensityBand(
  assetsToRevenue: number | null,
  capexToRevenue: number | null
): FinancialFeaturesRecord["capital_intensity_band"]["value"] {
  const a = assetsToRevenue ?? 0;
  const c = capexToRevenue ?? 0;
  if (a >= 2.0 || c >= 0.15) return "high";
  if (a >= 1.0 || c >= 0.06) return "moderate";
  return "low";
}

/**
 * Derive peer financial bands from normalized XBRL facts.
 * Returns null when revenue cannot be resolved (insufficient source support).
 */
export function deriveFinancialFeaturesFromFacts(input: {
  companyKey: string;
  asOf: string;
  facts: Array<NormalizedFinancialFact & { is_canonical?: boolean }>;
}): FinancialFeaturesRecord | null {
  const revenue2024 = canonicalValue(input.facts, "revenue", 2024);
  const revenue2023 = canonicalValue(input.facts, "revenue", 2023);
  const revenue =
    revenue2024 ??
    canonicalValue(input.facts, "revenue") ??
    null;
  if (revenue == null) return null;

  const operatingIncome =
    canonicalValue(input.facts, "operating_income", 2024) ??
    canonicalValue(input.facts, "operating_income");
  const assets =
    canonicalValue(input.facts, "assets", 2024) ??
    canonicalValue(input.facts, "assets");
  const debt =
    canonicalValue(input.facts, "long_term_debt", 2024) ??
    canonicalValue(input.facts, "long_term_debt");
  const capex =
    canonicalValue(input.facts, "capex", 2024) ??
    canonicalValue(input.facts, "capex");

  const yoy =
    revenue2024 != null && revenue2023 != null && revenue2023 !== 0
      ? (revenue2024 - revenue2023) / Math.abs(revenue2023)
      : null;
  const margin =
    operatingIncome != null && revenue !== 0 ? operatingIncome / revenue : null;
  const leverage = debt != null && assets != null && assets !== 0 ? debt / assets : null;
  const assetsToRevenue = assets != null && revenue !== 0 ? assets / revenue : null;
  const capexToRevenue = capex != null && revenue !== 0 ? capex / revenue : null;

  const note = "Derived from independent verified offline companyfacts";
  const q = <T>(value: T) => ({
    value,
    quality: "derived" as const,
    as_of: input.asOf,
    note,
  });

  return {
    company_key: input.companyKey,
    as_of: input.asOf,
    currency: "USD",
    size_band: q(sizeBand(revenue, assets)),
    revenue_growth_band: q(growthBand(yoy)),
    profitability_band: q(profitabilityBand(margin)),
    leverage_band: q(leverageBand(leverage)),
    capital_intensity_band: q(
      capitalIntensityBand(assetsToRevenue, capexToRevenue)
    ),
    revenue_ttm_illustrative_usd: q(revenue),
  };
}
