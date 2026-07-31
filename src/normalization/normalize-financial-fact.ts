import { mapConcept } from "./xbrl-concept-map.js";

export interface RawXbrlFact {
  concept: string;
  label?: string;
  unit: string;
  val: number;
  end?: string;
  start?: string;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

export interface NormalizedFinancialFact {
  company_key: string;
  concept: string;
  taxonomy_namespace: string;
  original_label: string | null;
  normalized_metric: string | null;
  value_numeric: number;
  unit: string;
  start_date: string | null;
  end_date: string | null;
  filing_date: string | null;
  accession_number: string | null;
  fiscal_year: number | null;
  fiscal_period: string | null;
  form: string | null;
  frame: string | null;
  is_segment: boolean;
  data_quality_status: "normalized" | "unmapped" | "unit_conflict";
}

export function normalizeFinancialFact(
  companyKey: string,
  namespace: string,
  fact: RawXbrlFact
): NormalizedFinancialFact {
  const mapping = mapConcept(fact.concept);
  let status: NormalizedFinancialFact["data_quality_status"] = mapping
    ? "normalized"
    : "unmapped";
  if (mapping && mapping.preferred_unit !== fact.unit && fact.unit !== "USD/shares") {
    // allow shares unit mismatch only for share metrics
    if (mapping.preferred_unit === "USD" && fact.unit !== "USD") {
      status = "unit_conflict";
    }
  }
  return {
    company_key: companyKey,
    concept: fact.concept,
    taxonomy_namespace: namespace,
    original_label: fact.label ?? null,
    normalized_metric: mapping?.normalized_metric ?? null,
    value_numeric: fact.val,
    unit: fact.unit,
    start_date: fact.start ?? null,
    end_date: fact.end ?? null,
    filing_date: fact.filed ?? null,
    accession_number: fact.accn ?? null,
    fiscal_year: fact.fy ?? null,
    fiscal_period: fact.fp ?? null,
    form: fact.form ?? null,
    frame: fact.frame ?? null,
    is_segment: false,
    data_quality_status: status,
  };
}

export function extractFactsFromCompanyFactsPayload(
  companyKey: string,
  payload: unknown
): NormalizedFinancialFact[] {
  const root = payload as {
    facts?: Record<string, Record<string, { label?: string; units?: Record<string, Array<Record<string, unknown>>> }>>;
  };
  const out: NormalizedFinancialFact[] = [];
  for (const [ns, concepts] of Object.entries(root.facts ?? {})) {
    for (const [concept, body] of Object.entries(concepts)) {
      for (const [unit, points] of Object.entries(body.units ?? {})) {
        for (const point of points) {
          if (typeof point.val !== "number") continue;
          out.push(
            normalizeFinancialFact(companyKey, ns, {
              concept,
              label: body.label,
              unit,
              val: point.val,
              end: typeof point.end === "string" ? point.end : undefined,
              start: typeof point.start === "string" ? point.start : undefined,
              accn: typeof point.accn === "string" ? point.accn : undefined,
              fy: typeof point.fy === "number" ? point.fy : undefined,
              fp: typeof point.fp === "string" ? point.fp : undefined,
              form: typeof point.form === "string" ? point.form : undefined,
              filed: typeof point.filed === "string" ? point.filed : undefined,
              frame: typeof point.frame === "string" ? point.frame : undefined,
            })
          );
        }
      }
    }
  }
  return out;
}
