import { ancestorsOf, type TaxonomyIndex } from "../config/load-taxonomy.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type {
  BusinessSegmentRecord,
  ClassificationResult,
  EvidenceRecord,
  OperatingModelRecord,
  SegmentCoverageMeta,
} from "../domain/types.js";
import { calculateClassificationConfidence } from "./calculate-classification-confidence.js";

const QSR_FORMAT = "quick_service_restaurants";
const FAST_CASUAL_FORMAT = "fast_casual_restaurants";

export function assignPrimaryPath(input: {
  companyKey: string;
  segments: BusinessSegmentRecord[];
  coverage: SegmentCoverageMeta | undefined;
  operating: OperatingModelRecord | undefined;
  evidence: EvidenceRecord[];
  taxonomy: TaxonomyIndex;
  thresholds: ClassificationThresholds;
  asOf: string;
  forcedNodeId?: string;
}): ClassificationResult["primary"] & {
  ambiguity: boolean;
  calculated_node_id: string | null;
} {
  const { thresholds, taxonomy } = input;

  if (input.forcedNodeId) {
    const node = taxonomy.byId.get(input.forcedNodeId);
    if (!node) throw new Error(`Forced node missing: ${input.forcedNodeId}`);
    const pathNodes = ancestorsOf(taxonomy, node.id).map((n) => ({
      id: n.id,
      name: n.name,
      node_type: n.node_type,
      depth: n.depth ?? 0,
    }));
    const conf = calculateClassificationConfidence({
      coverage: input.coverage,
      evidence: input.evidence,
      thresholds,
      ambiguity: false,
      isManual: true,
      asOf: input.asOf,
    });
    return {
      node_id: node.id,
      path: node.path!,
      nodes: pathNodes,
      confidence: conf.final,
      confidence_components: conf,
      is_manual: true,
      primary_selection_reason: "manual_override_force_primary",
      evidence_ids: input.evidence.map((e) => e.evidence_id),
      ambiguity: false,
      calculated_node_id: null,
    };
  }

  const mapped = input.segments.filter((s) => s.node_id);
  if (mapped.length === 0) {
    return {
      node_id: "",
      path: "",
      nodes: [],
      confidence: 0,
      confidence_components: calculateClassificationConfidence({
        coverage: input.coverage,
        evidence: input.evidence,
        thresholds,
        ambiguity: true,
        isManual: false,
        asOf: input.asOf,
      }),
      is_manual: false,
      primary_selection_reason: "human_review_no_mapped_segments",
      evidence_ids: input.evidence.map((e) => e.evidence_id),
      ambiguity: true,
      calculated_node_id: null,
    };
  }

  // Aggregate revenue by node
  const byNode = new Map<string, { revenue: number; oi: number }>();
  for (const s of mapped) {
    const cur = byNode.get(s.node_id!) ?? { revenue: 0, oi: 0 };
    cur.revenue += s.reported_weight;
    cur.oi += s.operating_income_weight ?? 0;
    byNode.set(s.node_id!, cur);
  }
  const ranked = [...byNode.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  let selected = ranked[0][0];
  let reason = "consolidated_revenue";
  let ambiguity = false;

  if (ranked.length > 1) {
    const gap = ranked[0][1].revenue - ranked[1][1].revenue;
    if (gap <= thresholds.primary_path.revenue_tie_epsilon) {
      const byOi = [...ranked].sort((a, b) => b[1].oi - a[1].oi);
      if (
        Math.abs(byOi[0][1].oi - byOi[1][1].oi) >
        thresholds.primary_path.operating_income_tie_epsilon
      ) {
        selected = byOi[0][0];
        reason = "operating_income";
      } else {
        ambiguity = true;
        reason = "human_review_ambiguous_revenue_and_income";
      }
    }
  }

  selected = refineRestaurantNode(selected, input.operating, thresholds, taxonomy);

  // Prefer IDM over foundry secondary for Intel-like mixes when IDM revenue leads
  // (already handled by revenue aggregation)

  const node = taxonomy.byId.get(selected);
  if (!node) {
    throw new Error(`Selected node missing from taxonomy: ${selected}`);
  }

  const pathNodes = ancestorsOf(taxonomy, node.id).map((n) => ({
    id: n.id,
    name: n.name,
    node_type: n.node_type,
    depth: n.depth ?? 0,
  }));

  const conf = calculateClassificationConfidence({
    coverage: input.coverage,
    evidence: input.evidence,
    thresholds,
    ambiguity,
    isManual: false,
    asOf: input.asOf,
  });

  if (!input.coverage || input.coverage.coverage_ratio < thresholds.segment_coverage.moderate_review_min) {
    ambiguity = true;
  }

  return {
    node_id: node.id,
    path: node.path!,
    nodes: pathNodes,
    confidence: conf.final,
    confidence_components: conf,
    is_manual: false,
    primary_selection_reason: reason,
    evidence_ids: input.evidence.map((e) => e.evidence_id),
    ambiguity,
    calculated_node_id: node.id,
  };
}

function refineRestaurantNode(
  nodeId: string,
  operating: OperatingModelRecord | undefined,
  thresholds: ClassificationThresholds,
  taxonomy: TaxonomyIndex
): string {
  const loc = operating?.franchise_mix?.locations_franchised_pct?.value;
  if (loc == null) return nodeId;

  const heavy = thresholds.franchise_mix.franchise_heavy_min_locations_pct;
  const companyMax = thresholds.franchise_mix.company_operated_heavy_max_locations_pct;

  const ancestors = ancestorsOf(taxonomy, nodeId).map((n) => n.id);
  const isQsr = ancestors.includes(QSR_FORMAT) || nodeId.startsWith("qsr_");
  const isFastCasual =
    ancestors.includes(FAST_CASUAL_FORMAT) || nodeId.startsWith("fast_casual_");
  const isAssetLight = nodeId === "restaurant_franchisors_asset_light";

  if (isAssetLight) return nodeId;

  let label: "franchise_heavy" | "company_operated_heavy" | "hybrid";
  if (loc >= heavy) label = "franchise_heavy";
  else if (loc <= companyMax) label = "company_operated_heavy";
  else label = "hybrid";

  if (isQsr) {
    if (label === "franchise_heavy") return "qsr_franchise_heavy";
    if (label === "company_operated_heavy") return "qsr_company_operated";
    return "qsr_hybrid_franchise";
  }
  if (isFastCasual) {
    if (label === "franchise_heavy") return "fast_casual_franchise_heavy";
    if (label === "company_operated_heavy") return "fast_casual_company_operated";
    return "fast_casual_hybrid_franchise";
  }
  return nodeId;
}
