import type { PilotData } from "../config/load-pilot-universe.js";
import type { EvidenceCandidate } from "../evidence/extract-evidence-candidates.js";
import type { ResolvedCompanyIdentifiers } from "../sources/types.js";
import type { NormalizedFinancialFact } from "../normalization/normalize-financial-fact.js";

export type FieldReconciliationStatus =
  | "confirmed_by_source"
  | "source_supported_minor_difference"
  | "material_conflict"
  | "not_found_in_source"
  | "source_contains_greater_detail"
  | "curated_illustrative"
  | "human_interpretation_required";

export interface FieldReconciliation {
  company_key: string;
  field: string;
  curated_value: unknown;
  source_value: unknown;
  status: FieldReconciliationStatus;
  notes: string;
}

export interface ReconciliationReport {
  fields: FieldReconciliation[];
  summary: Record<FieldReconciliationStatus, number>;
}

export function reconcileCompany(
  companyKey: string,
  data: PilotData,
  resolution: ResolvedCompanyIdentifiers,
  facts: NormalizedFinancialFact[],
  evidence: EvidenceCandidate[]
): FieldReconciliation[] {
  const company = data.companies.find((c) => c.company_key === companyKey)!;
  const rows: FieldReconciliation[] = [];

  rows.push({
    company_key: companyKey,
    field: "cik",
    curated_value: company.cik,
    source_value: resolution.resolved_cik,
    status:
      resolution.status === "resolved"
        ? "confirmed_by_source"
        : resolution.status === "conflict"
          ? "material_conflict"
          : "not_found_in_source",
    notes: resolution.discrepancy ?? "CIK reconciliation",
  });

  rows.push({
    company_key: companyKey,
    field: "legal_name",
    curated_value: company.legal_name,
    source_value: resolution.resolved_registrant,
    status:
      resolution.resolved_registrant &&
      resolution.resolved_registrant.toLowerCase().includes(
        company.display_name.toLowerCase().slice(0, 4)
      )
        ? "confirmed_by_source"
        : "source_supported_minor_difference",
    notes: "Registrant name vs curated legal/display name",
  });

  const desc = company.primary_business_description;
  const businessEv = evidence.find((e) =>
    e.proposed_evidence_type.includes("filing_section_business")
  );
  rows.push({
    company_key: companyKey,
    field: "primary_business_description",
    curated_value: desc.value,
    source_value: businessEv?.extracted_text?.slice(0, 200) ?? null,
    status: businessEv
      ? desc.quality === "illustrative"
        ? "source_contains_greater_detail"
        : "source_supported_minor_difference"
      : desc.quality === "illustrative"
        ? "curated_illustrative"
        : "human_interpretation_required",
    notes: "Business description from curated fixture vs filing business section",
  });

  const franchiseEv = evidence.find(
    (e) => e.proposed_evidence_type === "franchise_locations_pct"
  );
  const op = data.operating.find((o) => o.company_key === companyKey);
  if (op?.franchise_mix) {
    const curated = op.franchise_mix.locations_franchised_pct.value;
    const source = franchiseEv ? Number(franchiseEv.extracted_value) : null;
    let status: FieldReconciliationStatus = "not_found_in_source";
    if (source != null && curated != null) {
      status =
        Math.abs(source - curated) <= 0.05
          ? "confirmed_by_source"
          : Math.abs(source - curated) <= 0.15
            ? "source_supported_minor_difference"
            : "material_conflict";
    } else if (curated != null && op.franchise_mix.locations_franchised_pct.quality === "illustrative") {
      status = "curated_illustrative";
    }
    rows.push({
      company_key: companyKey,
      field: "franchise_locations_pct",
      curated_value: curated,
      source_value: source,
      status,
      notes: "Franchise location mix",
    });
  }

  const revenueFact = facts.find(
    (f) => f.normalized_metric === "revenue" && (f as { is_canonical?: boolean }).is_canonical
  ) ?? facts.find((f) => f.normalized_metric === "revenue");
  rows.push({
    company_key: companyKey,
    field: "revenue_ttm_illustrative",
    curated_value: null,
    source_value: revenueFact?.value_numeric ?? null,
    status: revenueFact
      ? "source_contains_greater_detail"
      : "curated_illustrative",
    notes: "Phase-2 omitted live revenue; source facts now available when mapped",
  });

  for (const band of ["size_band", "revenue_growth_band", "profitability_band"] as const) {
    const fin = data.financial.find((f) => f.company_key === companyKey);
    const field = fin?.[band];
    if (!field) continue;
    rows.push({
      company_key: companyKey,
      field: band,
      curated_value: field.value,
      source_value: null,
      status:
        field.quality === "illustrative"
          ? "curated_illustrative"
          : "human_interpretation_required",
      notes: "Banded peer features remain illustrative unless derived later",
    });
  }

  return rows;
}

export function buildReconciliationReport(
  data: PilotData,
  resolutions: ResolvedCompanyIdentifiers[],
  factsByCompany: Map<string, NormalizedFinancialFact[]>,
  evidenceByCompany: Map<string, EvidenceCandidate[]>
): ReconciliationReport {
  const fields: FieldReconciliation[] = [];
  for (const company of data.companies) {
    const resolution = resolutions.find((r) => r.company_key === company.company_key)!;
    fields.push(
      ...reconcileCompany(
        company.company_key,
        data,
        resolution,
        factsByCompany.get(company.company_key) ?? [],
        evidenceByCompany.get(company.company_key) ?? []
      )
    );
  }
  const summary = {
    confirmed_by_source: 0,
    source_supported_minor_difference: 0,
    material_conflict: 0,
    not_found_in_source: 0,
    source_contains_greater_detail: 0,
    curated_illustrative: 0,
    human_interpretation_required: 0,
  } satisfies Record<FieldReconciliationStatus, number>;
  for (const f of fields) summary[f.status] += 1;
  return { fields, summary };
}
