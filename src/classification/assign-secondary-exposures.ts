import { type TaxonomyIndex } from "../config/load-taxonomy.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type {
  BusinessSegmentRecord,
  ClassificationResult,
  EvidenceRecord,
} from "../domain/types.js";

export function assignSecondaryExposures(input: {
  primaryNodeId: string | null;
  segments: BusinessSegmentRecord[];
  evidence: EvidenceRecord[];
  taxonomy: TaxonomyIndex;
  thresholds: ClassificationThresholds;
}): ClassificationResult["secondary"] {
  if (!input.primaryNodeId) return [];
  const { thresholds } = input;
  const byNode = new Map<string, { revenue: number; oi: number }>();
  for (const s of input.segments) {
    if (!s.node_id || s.node_id === input.primaryNodeId) continue;
    const cur = byNode.get(s.node_id) ?? { revenue: 0, oi: 0 };
    cur.revenue += s.reported_weight;
    cur.oi += s.operating_income_weight ?? 0;
    byNode.set(s.node_id, cur);
  }

  const out: ClassificationResult["secondary"] = [];
  for (const [nodeId, weights] of byNode) {
    const node = input.taxonomy.byId.get(nodeId);
    if (!node) continue;
    let materiality_reason = "";
    if (weights.revenue >= thresholds.secondary_exposure.min_revenue_pct) {
      materiality_reason = `revenue_share_${weights.revenue.toFixed(2)}`;
    } else if (
      weights.oi >= thresholds.secondary_exposure.min_operating_income_pct
    ) {
      materiality_reason = `operating_income_share_${weights.oi.toFixed(2)}`;
    } else {
      continue;
    }
    out.push({
      node_id: nodeId,
      path: node.path!,
      weight: Number(weights.revenue.toFixed(4)),
      materiality_reason,
      confidence: 0.75,
      is_manual: false,
      evidence_ids: input.evidence
        .filter((e) => e.related_node_id === nodeId || !e.related_node_id)
        .map((e) => e.evidence_id),
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
