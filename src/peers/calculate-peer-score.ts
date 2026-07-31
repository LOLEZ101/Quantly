import { clampScore, type PeerWeightsConfig } from "../config/load-peer-weights.js";
import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type { EligibilityDecision } from "./apply-eligibility-rules.js";
import type { ScoreComponent } from "../domain/types.js";

export function calculatePeerScore(input: {
  components: ScoreComponent[];
  eligibility: EligibilityDecision;
  availableWeightShare: number;
  weights: PeerWeightsConfig;
  thresholds: ClassificationThresholds;
  sameCluster: boolean;
  adjacent: boolean;
  explicitCompetitor?: boolean;
}): {
  score: number;
  confidence: number;
  incomplete: boolean;
} {
  if (input.eligibility.result === "ineligible") {
    return { score: 0, confidence: 1, incomplete: false };
  }

  let score = input.components.reduce(
    (s, c) => s + c.weighted_contribution,
    0
  );

  if (input.sameCluster) {
    score += input.weights.modifiers.same_primary_peer_cluster?.boost ?? 0;
  } else if (input.adjacent) {
    score += input.weights.modifiers.adjacent_category_match?.boost ?? 0;
  }

  if (input.explicitCompetitor) {
    score += 0.12;
  }

  if (input.eligibility.result === "eligible_with_penalty") {
    score -= input.eligibility.penalty;
  }

  score = clampScore(score, input.weights.score_bounds);

  const incomplete =
    input.availableWeightShare <
    input.thresholds.peer_scoring.incomplete_score_flag_below_available_share;

  const confidence = clampScore(
    input.availableWeightShare *
      (input.eligibility.result === "eligible_with_penalty" ? 0.85 : 1)
  );

  return {
    score: Number(score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    incomplete,
  };
}
