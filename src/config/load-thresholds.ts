import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { repoPath } from "./paths.js";

export interface ClassificationThresholds {
  version: string;
  franchise_mix: {
    franchise_heavy_min_locations_pct: number;
    company_operated_heavy_max_locations_pct: number;
    unknown_requires_review: boolean;
  };
  primary_path: {
    revenue_tie_epsilon: number;
    operating_income_tie_epsilon: number;
    ambiguity_score_gap: number;
    selection_cascade: string[];
  };
  secondary_exposure: {
    min_revenue_pct: number;
    min_operating_income_pct: number;
    allow_strategic_importance: boolean;
  };
  segment_coverage: {
    complete_min: number;
    complete_max: number;
    usable_with_warning_min: number;
    moderate_review_min: number;
    material_missing_share_for_review: number;
  };
  confidence: {
    weights: Record<string, number>;
    stale_evidence_days: number;
  };
  peer_scoring: {
    allow_reweight_among_available: boolean;
    min_available_weight_share: number;
    incomplete_score_flag_below_available_share: number;
    reciprocity_similar_score_epsilon: number;
    max_peers_per_type: number;
    close_peer_min_score: number;
  };
}

export function loadThresholds(
  path = repoPath("config/classification-thresholds.yaml")
): ClassificationThresholds {
  return parseYaml(readFileSync(path, "utf8")) as ClassificationThresholds;
}
