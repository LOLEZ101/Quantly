import { loadYamlAdjacency, type AdjacencyConfig } from "./adjacency.js";
import type { TaxonomyIndex } from "../config/load-taxonomy.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type { ClassificationResult } from "../domain/types.js";
import { parentId } from "../config/load-taxonomy.js";

export interface PeerCandidate {
  target_company_id: string;
  peer_company_id: string;
  reasons: string[];
}

export function generateCandidates(input: {
  targetKey: string;
  classifications: Map<string, ClassificationResult>;
  data: PilotData;
  taxonomy: TaxonomyIndex;
  adjacency?: AdjacencyConfig;
}): PeerCandidate[] {
  const adjacency = input.adjacency ?? loadYamlAdjacency();
  const target = input.classifications.get(input.targetKey);
  if (!target?.primary) return [];

  const targetOp = input.data.operating.find((o) => o.company_key === input.targetKey);
  const targetCust = input.data.customers.filter((c) => c.company_key === input.targetKey);
  const targetGeo = input.data.geos.filter((g) => g.company_key === input.targetKey);
  const targetSeg = input.data.segments.filter((s) => s.company_key === input.targetKey);

  const out = new Map<string, Set<string>>();

  function add(peer: string, reason: string) {
    if (peer === input.targetKey) return;
    const set = out.get(peer) ?? new Set();
    set.add(reason);
    out.set(peer, set);
  }

  for (const [key, cls] of input.classifications) {
    if (key === input.targetKey || !cls.primary) continue;

    if (cls.primary.node_id === target.primary!.node_id) {
      add(key, "same_terminal_taxonomy_node");
    }

    const tParent = parentId(input.taxonomy, target.primary!.node_id);
    const pParent = parentId(input.taxonomy, cls.primary.node_id);
    if (tParent && pParent && tParent === pParent) {
      add(key, "same_parent_node");
    }

    const adjHit = adjacency.relationships.some(
      (r) =>
        (r.source_node_id === target.primary!.node_id &&
          r.target_node_id === cls.primary!.node_id) ||
        (r.target_node_id === target.primary!.node_id &&
          r.source_node_id === cls.primary!.node_id)
    );
    if (adjHit) add(key, "adjacent_taxonomy_node");

    const peerOp = input.data.operating.find((o) => o.company_key === key);
    if (targetOp && peerOp) {
      const tModels = new Set(targetOp.infrastructure_models.map((m) => m.model_code));
      if (peerOp.infrastructure_models.some((m) => tModels.has(m.model_code))) {
        add(key, "shared_operating_model");
      }
      const tRev = new Set(targetOp.revenue_models.map((m) => m.model_code));
      if (peerOp.revenue_models.some((m) => tRev.has(m.model_code))) {
        add(key, "shared_revenue_model");
      }
    }

    const peerCust = input.data.customers.filter((c) => c.company_key === key);
    if (
      targetCust.some((tc) =>
        peerCust.some((pc) => pc.customer_type === tc.customer_type && tc.weight >= 0.2)
      )
    ) {
      add(key, "shared_customer_type");
    }

    const peerGeo = input.data.geos.filter((g) => g.company_key === key);
    if (
      targetGeo.some((tg) =>
        peerGeo.some((pg) => pg.geo_code === tg.geo_code && tg.weight >= 0.2)
      )
    ) {
      add(key, "shared_geography");
    }

    const peerSeg = input.data.segments.filter((s) => s.company_key === key);
    const tNodes = new Set(targetSeg.map((s) => s.node_id).filter(Boolean));
    if (peerSeg.some((s) => s.node_id && tNodes.has(s.node_id))) {
      add(key, "similar_segment_composition");
    }
  }

  for (const link of input.data.competitors) {
    if (link.company_key === input.targetKey) {
      add(link.competitor_company_key, "explicit_manual_competitor");
    }
    if (link.competitor_company_key === input.targetKey) {
      add(link.company_key, "explicit_manual_competitor");
    }
  }

  return [...out.entries()].map(([peer_company_id, reasons]) => ({
    target_company_id: input.targetKey,
    peer_company_id,
    reasons: [...reasons].sort(),
  }));
}
