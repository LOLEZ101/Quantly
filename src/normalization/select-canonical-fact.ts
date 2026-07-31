import type { NormalizedFinancialFact } from "./normalize-financial-fact.js";

export interface CanonicalSelection {
  selected: NormalizedFinancialFact | null;
  contested: NormalizedFinancialFact[];
  reason: string;
}

const FORM_RANK: Record<string, number> = {
  "10-K": 100,
  "20-F": 95,
  "40-F": 95,
  "10-K/A": 90,
  "10-Q": 70,
  "6-K": 60,
  "8-K": 40,
};

/**
 * Deterministic canonical selection among facts for the same metric/period.
 * Prefers annual forms, non-amendments when quality equal, later filing date,
 * then stable concept name. Never selects merely by largest numeric value.
 */
export function selectCanonicalFact(
  facts: NormalizedFinancialFact[],
  metric: string,
  periodEnd?: string
): CanonicalSelection {
  const pool = facts.filter(
    (f) =>
      f.normalized_metric === metric &&
      !f.is_segment &&
      f.data_quality_status === "normalized" &&
      (periodEnd ? f.end_date === periodEnd : true)
  );
  if (!pool.length) {
    return { selected: null, contested: [], reason: "no_candidates" };
  }

  const scored = [...pool].sort((a, b) => {
    const formDelta =
      (FORM_RANK[b.form ?? ""] ?? 0) - (FORM_RANK[a.form ?? ""] ?? 0);
    if (formDelta !== 0) return formDelta;
    const aAmend = (a.form ?? "").includes("/A") ? 1 : 0;
    const bAmend = (b.form ?? "").includes("/A") ? 1 : 0;
    if (aAmend !== bAmend) return aAmend - bAmend;
    const filedDelta = (b.filing_date ?? "").localeCompare(a.filing_date ?? "");
    if (filedDelta !== 0) return filedDelta;
    return a.concept.localeCompare(b.concept);
  });

  const selected = scored[0];
  const contested = scored.slice(1).filter((f) => {
    if (!selected) return false;
    const rel =
      Math.abs(f.value_numeric - selected.value_numeric) /
      Math.max(1, Math.abs(selected.value_numeric));
    return rel > 0.05;
  });

  return {
    selected,
    contested,
    reason: contested.length
      ? "selected_with_material_conflicts"
      : "selected_unique_or_immaterial_variance",
  };
}

export function markCanonicalFacts(
  facts: NormalizedFinancialFact[]
): Array<NormalizedFinancialFact & { is_canonical: boolean }> {
  const metrics = [
    ...new Set(facts.map((f) => f.normalized_metric).filter(Boolean)),
  ] as string[];
  const periods = [
    ...new Set(facts.map((f) => f.end_date).filter(Boolean)),
  ] as string[];
  const canonicalKeys = new Set<string>();

  for (const metric of metrics) {
    for (const period of periods) {
      const { selected } = selectCanonicalFact(facts, metric, period);
      if (selected) {
        canonicalKeys.add(
          `${selected.concept}|${selected.end_date}|${selected.accession_number}|${selected.unit}`
        );
      }
    }
  }

  return facts.map((f) => ({
    ...f,
    is_canonical: canonicalKeys.has(
      `${f.concept}|${f.end_date}|${f.accession_number}|${f.unit}`
    ),
  }));
}
