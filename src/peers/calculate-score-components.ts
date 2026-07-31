import type { PeerWeightsConfig } from "../config/load-peer-weights.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type {
  ClassificationResult,
  PeerType,
  ScoreComponent,
} from "../domain/types.js";
import { loadYamlAdjacency } from "./adjacency.js";

const BAND_SCORE: Record<string, number> = {
  mega: 1,
  large: 0.75,
  mid: 0.5,
  small: 0.25,
  high: 1,
  moderate: 0.6,
  low: 0.3,
  negative: 0,
};

function bandSim(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const av = BAND_SCORE[a];
  const bv = BAND_SCORE[b];
  if (av == null || bv == null) return null;
  return 1 - Math.min(1, Math.abs(av - bv));
}

function weightedOverlap(
  a: Array<{ key: string; weight: number }>,
  b: Array<{ key: string; weight: number }>
): number | null {
  if (a.length === 0 || b.length === 0) return null;
  const bMap = new Map(b.map((x) => [x.key, x.weight]));
  let num = 0;
  let den = 0;
  const keys = new Set([...a.map((x) => x.key), ...b.map((x) => x.key)]);
  for (const k of keys) {
    const aw = a.find((x) => x.key === k)?.weight ?? 0;
    const bw = bMap.get(k) ?? 0;
    num += Math.min(aw, bw);
    den += Math.max(aw, bw);
  }
  return den === 0 ? null : num / den;
}

export function calculateScoreComponents(input: {
  targetKey: string;
  peerKey: string;
  peerType: PeerType;
  classifications: Map<string, ClassificationResult>;
  data: PilotData;
  weights: PeerWeightsConfig;
  thresholds: ClassificationThresholds;
}): { components: ScoreComponent[]; availableWeightShare: number } {
  const profile = input.weights.peer_types[input.peerType];
  if (!profile) throw new Error(`Missing peer type weights: ${input.peerType}`);

  const tCls = input.classifications.get(input.targetKey)!;
  const pCls = input.classifications.get(input.peerKey)!;
  const adjacency = loadYamlAdjacency();

  const raw: Record<string, number | null> = {};

  // taxonomy proximity
  if (tCls.primary && pCls.primary) {
    if (tCls.primary.node_id === pCls.primary.node_id) raw.taxonomy_proximity = 1;
    else {
      const adj = adjacency.relationships.find(
        (r) =>
          (r.source_node_id === tCls.primary!.node_id &&
            r.target_node_id === pCls.primary!.node_id) ||
          (r.target_node_id === tCls.primary!.node_id &&
            r.source_node_id === pCls.primary!.node_id)
      );
      if (adj) raw.taxonomy_proximity = 0.55 + 0.35 * adj.strength;
      else {
        const tParts = tCls.primary.path.split(".");
        const pParts = pCls.primary.path.split(".");
        let shared = 0;
        while (
          shared < tParts.length &&
          shared < pParts.length &&
          tParts[shared] === pParts[shared]
        ) {
          shared++;
        }
        raw.taxonomy_proximity = Math.min(0.7, shared / Math.max(tParts.length, pParts.length));
      }
    }
  } else raw.taxonomy_proximity = null;

  const tOp = input.data.operating.find((o) => o.company_key === input.targetKey);
  const pOp = input.data.operating.find((o) => o.company_key === input.peerKey);
  raw.business_model_similarity = weightedOverlap(
    (tOp?.infrastructure_models ?? []).map((m) => ({
      key: m.model_code,
      weight: m.weight,
    })),
    (pOp?.infrastructure_models ?? []).map((m) => ({
      key: m.model_code,
      weight: m.weight,
    }))
  );

  raw.segment_overlap = weightedOverlap(
    input.data.segments
      .filter((s) => s.company_key === input.targetKey && s.node_id)
      .map((s) => ({ key: s.node_id!, weight: s.reported_weight })),
    input.data.segments
      .filter((s) => s.company_key === input.peerKey && s.node_id)
      .map((s) => ({ key: s.node_id!, weight: s.reported_weight }))
  );

  raw.customer_overlap = weightedOverlap(
    input.data.customers
      .filter((c) => c.company_key === input.targetKey)
      .map((c) => ({ key: c.customer_type, weight: c.weight })),
    input.data.customers
      .filter((c) => c.company_key === input.peerKey)
      .map((c) => ({ key: c.customer_type, weight: c.weight }))
  );

  raw.geographic_overlap = weightedOverlap(
    input.data.geos
      .filter((g) => g.company_key === input.targetKey)
      .map((g) => ({ key: g.geo_code, weight: g.weight })),
    input.data.geos
      .filter((g) => g.company_key === input.peerKey)
      .map((g) => ({ key: g.geo_code, weight: g.weight }))
  );

  const tFin = input.data.financial.find((f) => f.company_key === input.targetKey);
  const pFin = input.data.financial.find((f) => f.company_key === input.peerKey);
  raw.size_similarity = bandSim(tFin?.size_band.value, pFin?.size_band.value);
  raw.margin_similarity = bandSim(
    tFin?.profitability_band.value,
    pFin?.profitability_band.value
  );
  raw.growth_similarity = bandSim(
    tFin?.revenue_growth_band.value,
    pFin?.revenue_growth_band.value
  );
  raw.capital_intensity_similarity = bandSim(
    tFin?.capital_intensity_band.value,
    pFin?.capital_intensity_band.value
  );
  raw.leverage_similarity = bandSim(
    tFin?.leverage_band.value,
    pFin?.leverage_band.value
  );

  const explicit = input.data.competitors.some(
    (c) =>
      (c.company_key === input.targetKey &&
        c.competitor_company_key === input.peerKey) ||
      (c.company_key === input.peerKey &&
        c.competitor_company_key === input.targetKey)
  );
  raw.competitive_overlap = explicit
    ? 1
    : raw.taxonomy_proximity != null && raw.taxonomy_proximity >= 0.95
      ? 0.8
      : raw.customer_overlap;
  raw.manual_assignment = null;

  const configured = profile.weights;
  const availableEntries = Object.entries(configured).filter(([factor, w]) => {
    if (w <= 0) return false;
    return raw[factor] != null;
  });
  const availableWeight = availableEntries.reduce((s, [, w]) => s + w, 0);
  const totalConfigured = Object.values(configured).reduce((s, w) => s + w, 0);
  const availableWeightShare =
    totalConfigured === 0 ? 0 : availableWeight / totalConfigured;

  const reweight =
    input.thresholds.peer_scoring.allow_reweight_among_available &&
    availableWeight > 0;

  const components: ScoreComponent[] = Object.entries(configured).map(
    ([factor, weight]) => {
      const value = raw[factor] ?? null;
      const missing = value == null || weight <= 0;
      const adjusted =
        !missing && reweight ? weight / availableWeight : missing ? 0 : weight;
      const factor_score = value == null ? 0 : value;
      return {
        factor_code: factor,
        raw_score: value,
        factor_score: Number(factor_score.toFixed(4)),
        configured_weight: weight,
        adjusted_weight: Number(adjusted.toFixed(4)),
        weighted_contribution: Number((factor_score * adjusted).toFixed(4)),
        missing: value == null,
        notes:
          value == null
            ? "Component unavailable in pilot fixtures"
            : weight <= 0
              ? "Zero weight for this peer type"
              : null,
      };
    }
  );

  return {
    components,
    availableWeightShare: Number(availableWeightShare.toFixed(4)),
  };
}
