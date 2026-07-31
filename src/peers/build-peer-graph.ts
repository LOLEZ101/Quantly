import type { PeerEligibilityConfig } from "../config/load-peer-eligibility.js";
import {
  PHASE2_PEER_TYPES,
  type PeerWeightsConfig,
} from "../config/load-peer-weights.js";
import type { TaxonomyIndex } from "../config/load-taxonomy.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import type {
  ClassificationResult,
  ManualOverrideRecord,
  PeerRelationshipResult,
  PeerType,
} from "../domain/types.js";
import { loadYamlAdjacency } from "./adjacency.js";
import { applyEligibilityRules } from "./apply-eligibility-rules.js";
import { calculatePeerScore } from "./calculate-peer-score.js";
import { calculateScoreComponents } from "./calculate-score-components.js";
import { explainPeerMatch } from "./explain-peer-match.js";
import { generateCandidates } from "./generate-candidates.js";
import { rankPeers } from "./rank-peers.js";

export function buildPeerGraph(input: {
  data: PilotData;
  classifications: ClassificationResult[];
  taxonomy: TaxonomyIndex;
  weights: PeerWeightsConfig;
  eligibility: PeerEligibilityConfig;
  thresholds: ClassificationThresholds;
  peerTypes?: PeerType[];
}): PeerRelationshipResult[] {
  const peerTypes = input.peerTypes ?? PHASE2_PEER_TYPES;
  const classMap = new Map(
    input.classifications.map((c) => [c.company_key, c])
  );
  const adjacency = loadYamlAdjacency();
  const companyName = new Map(
    input.data.companies.map((c) => [c.company_key, c.display_name])
  );

  const all: PeerRelationshipResult[] = [];

  for (const company of input.data.companies) {
    const candidates = generateCandidates({
      targetKey: company.company_key,
      classifications: classMap,
      data: input.data,
      taxonomy: input.taxonomy,
      adjacency,
    });

    for (const peerType of peerTypes) {
      const scored: PeerRelationshipResult[] = [];

      for (const cand of candidates) {
        const tNode = classMap.get(company.company_key)?.primary?.node_id;
        const pNode = classMap.get(cand.peer_company_id)?.primary?.node_id;
        if (!tNode || !pNode) continue;

        const eligibility = applyEligibilityRules({
          targetNodeId: tNode,
          peerNodeId: pNode,
          peerType,
          config: input.eligibility,
        });
        if (eligibility.result === "ineligible") continue;

        const { components, availableWeightShare } = calculateScoreComponents({
          targetKey: company.company_key,
          peerKey: cand.peer_company_id,
          peerType,
          classifications: classMap,
          data: input.data,
          weights: input.weights,
          thresholds: input.thresholds,
        });

        if (
          availableWeightShare <
          input.thresholds.peer_scoring.min_available_weight_share
        ) {
          continue;
        }

        const sameCluster = tNode === pNode;
        const adjacent = adjacency.relationships.some(
          (r) =>
            (r.source_node_id === tNode && r.target_node_id === pNode) ||
            (r.target_node_id === tNode && r.source_node_id === pNode)
        );

        const { score, confidence, incomplete } = calculatePeerScore({
          components,
          eligibility,
          availableWeightShare,
          weights: input.weights,
          thresholds: input.thresholds,
          sameCluster,
          adjacent,
          explicitCompetitor: cand.reasons.includes(
            "explicit_manual_competitor"
          ),
        });

        const threshold =
          input.weights.peer_types[peerType]?.default_threshold ?? 0;
        const taxonomyComponent = components.find(
          (c) => c.factor_code === "taxonomy_proximity"
        );
        const taxonomyScore = taxonomyComponent?.factor_score ?? 0;
        const explicitCompetitor = cand.reasons.includes(
          "explicit_manual_competitor"
        );

        // Direct competitors require taxonomy closeness or an explicit competitor link.
        if (
          (peerType === "direct_competitor" || peerType === "competitive") &&
          !explicitCompetitor &&
          taxonomyScore < 0.45
        ) {
          continue;
        }

        // Risk/market-behavior may cross adjacent value-chain nodes, but not unrelated industries.
        if (
          (peerType === "risk" || peerType === "market_behavior") &&
          taxonomyScore < 0.25 &&
          !cand.reasons.includes("adjacent_taxonomy_node") &&
          !explicitCompetitor
        ) {
          continue;
        }

        if (score < threshold) {
          if (peerType === "risk" || peerType === "market_behavior") {
            if (score < threshold * 0.8) continue;
          } else {
            continue;
          }
        }

        const explanation = explainPeerMatch({
          targetKey: company.company_key,
          peerKey: cand.peer_company_id,
          targetName: companyName.get(company.company_key) ?? company.company_key,
          peerName:
            companyName.get(cand.peer_company_id) ?? cand.peer_company_id,
          peerType,
          candidateReasons: cand.reasons,
          eligibility,
          components,
          score,
          incomplete,
          classifications: classMap,
        });

        scored.push({
          target_company_id: company.company_key,
          peer_company_id: cand.peer_company_id,
          peer_type: peerType,
          score,
          rank: 0,
          confidence,
          incomplete,
          is_manual: false,
          eligibility: eligibility.result,
          eligibility_rule_id: eligibility.rule_id,
          eligibility_penalty: eligibility.penalty,
          candidate_reasons: cand.reasons,
          components,
          explanation,
        });
      }

      const ranked = rankPeers(scored).slice(
        0,
        input.thresholds.peer_scoring.max_peers_per_type
      );
      all.push(...ranked);
    }
  }

  return applyPeerOverrides(all, input.data.overrides, classMap, companyName);
}

function applyPeerOverrides(
  relationships: PeerRelationshipResult[],
  overrides: ManualOverrideRecord[],
  classMap: Map<string, ClassificationResult>,
  companyName: Map<string, string>
): PeerRelationshipResult[] {
  let out = [...relationships];

  for (const ovr of overrides) {
    if (ovr.action === "remove_peer") {
      const peer = String(ovr.payload.peer_company_key ?? "");
      const peerType = ovr.payload.peer_type as PeerType | undefined;
      out = out.filter(
        (r) =>
          !(
            r.target_company_id === ovr.company_key &&
            r.peer_company_id === peer &&
            (!peerType || r.peer_type === peerType)
          )
      );
    }
    if (ovr.action === "add_peer") {
      const peer = String(ovr.payload.peer_company_key ?? "");
      const peerType = (ovr.payload.peer_type as PeerType) ?? "custom";
      const score = Number(ovr.payload.score ?? 1);
      const existing = out.find(
        (r) =>
          r.target_company_id === ovr.company_key &&
          r.peer_company_id === peer &&
          r.peer_type === peerType
      );
      if (!existing) {
        out.push({
          target_company_id: ovr.company_key,
          peer_company_id: peer,
          peer_type: peerType,
          score,
          rank: Number(ovr.payload.rank ?? 1),
          confidence: 1,
          incomplete: false,
          is_manual: true,
          eligibility: "eligible",
          eligibility_rule_id: "manual_override",
          eligibility_penalty: 0,
          candidate_reasons: ["manual_override"],
          components: [],
          explanation: {
            summary: `Manual peer override linking ${ovr.company_key} to ${peer}.`,
            similarities: ["Manually designated peer."],
            differences: [],
            limitations: ["Manual override; not model-scored."],
            candidate_reasons: ["manual_override"],
            eligibility_notes: [],
            why_appropriate: ovr.rationale,
            why_not_higher: "Manual score.",
            confidence: 1,
          },
          calculated_before_override: undefined,
        });
      }
    }
    if (ovr.action === "adjust_peer_rank") {
      const peer = String(ovr.payload.peer_company_key ?? "");
      const peerType = ovr.payload.peer_type as PeerType;
      const newRank = Number(ovr.payload.rank ?? 1);
      out = out.map((r) => {
        if (
          r.target_company_id === ovr.company_key &&
          r.peer_company_id === peer &&
          r.peer_type === peerType
        ) {
          return {
            ...r,
            rank: newRank,
            is_manual: true,
            calculated_before_override: { score: r.score, rank: r.rank },
          };
        }
        return r;
      });
    }
    if (ovr.action === "mark_relationship_reviewed") {
      // metadata-only in review workflow; relationships unchanged
      void classMap;
      void companyName;
    }
  }

  return out;
}
