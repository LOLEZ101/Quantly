import type { TaxonomyIndex } from "../config/load-taxonomy.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type { ClassificationResult } from "../domain/types.js";
import { assignPrimaryPath } from "./assign-primary-path.js";
import { assignSecondaryExposures } from "./assign-secondary-exposures.js";

export function classifyPilotCompany(
  companyKey: string,
  data: PilotData,
  taxonomy: TaxonomyIndex,
  thresholds: ClassificationThresholds
): ClassificationResult {
  const segments = data.segments.filter((s) => s.company_key === companyKey);
  const coverage = data.coverage.find((c) => c.company_key === companyKey);
  const operating = data.operating.find((o) => o.company_key === companyKey);
  const evidence = data.evidence.filter((e) => e.company_key === companyKey);
  const force = data.overrides.find(
    (o) =>
      o.company_key === companyKey &&
      o.action === "force_primary_classification"
  );
  const forcedNodeId =
    typeof force?.payload.node_id === "string" ? force.payload.node_id : undefined;

  const primaryRaw = assignPrimaryPath({
    companyKey,
    segments,
    coverage,
    operating,
    evidence,
    taxonomy,
    thresholds,
    asOf: data.universe.as_of,
    forcedNodeId,
  });

  const primary =
    primaryRaw.node_id === ""
      ? null
      : {
          node_id: primaryRaw.node_id,
          path: primaryRaw.path,
          nodes: primaryRaw.nodes,
          confidence: primaryRaw.confidence,
          confidence_components: primaryRaw.confidence_components,
          is_manual: primaryRaw.is_manual,
          primary_selection_reason: primaryRaw.primary_selection_reason,
          evidence_ids: primaryRaw.evidence_ids,
        };

  const secondary = assignSecondaryExposures({
    primaryNodeId: primary?.node_id ?? null,
    segments,
    evidence,
    taxonomy,
    thresholds,
  });

  // Apply add/remove secondary overrides
  let secondaryFinal = [...secondary];
  for (const ovr of data.overrides.filter((o) => o.company_key === companyKey)) {
    if (ovr.action === "add_secondary_exposure" && typeof ovr.payload.node_id === "string") {
      const node = taxonomy.byId.get(ovr.payload.node_id);
      if (node && !secondaryFinal.some((s) => s.node_id === node.id)) {
        secondaryFinal.push({
          node_id: node.id,
          path: node.path!,
          weight: Number(ovr.payload.weight ?? 0.1),
          materiality_reason: "manual_override_strategic_importance",
          confidence: 1,
          is_manual: true,
          evidence_ids: [],
        });
      }
    }
    if (
      ovr.action === "remove_secondary_exposure" &&
      typeof ovr.payload.node_id === "string"
    ) {
      secondaryFinal = secondaryFinal.filter((s) => s.node_id !== ovr.payload.node_id);
    }
  }

  return {
    company_key: companyKey,
    taxonomy_version: taxonomy.config.taxonomy_version,
    effective_date: data.universe.as_of,
    primary,
    secondary: secondaryFinal,
    calculated_before_override: forcedNodeId
      ? undefined
      : primaryRaw.is_manual
        ? undefined
        : primary,
    coverage_ratio: coverage?.coverage_ratio ?? 0,
    unallocated_weight: coverage?.unallocated_weight ?? 1,
  };
}

export function classifyAll(
  data: PilotData,
  taxonomy: TaxonomyIndex,
  thresholds: ClassificationThresholds
): ClassificationResult[] {
  return data.companies.map((c) =>
    classifyPilotCompany(c.company_key, data, taxonomy, thresholds)
  );
}
