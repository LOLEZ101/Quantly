import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { PeerType } from "../domain/types.js";
import { repoPath } from "./paths.js";

export interface PeerWeightsConfig {
  peer_model_version: string;
  effective_date: string;
  score_bounds: { min: number; max: number };
  factors: Record<string, { description: string }>;
  peer_types: Record<
    string,
    {
      description: string;
      default_threshold: number;
      weights: Record<string, number>;
    }
  >;
  modifiers: Record<string, { boost?: number; description: string }>;
}

export function loadPeerWeights(
  path = repoPath("config/peer-weights.yaml")
): PeerWeightsConfig {
  return parseYaml(readFileSync(path, "utf8")) as PeerWeightsConfig;
}

export const PHASE2_PEER_TYPES: PeerType[] = [
  "direct_competitor",
  "operating",
  "valuation",
  "growth",
  "risk",
  "market_behavior",
];

export function clampScore(score: number, bounds = { min: 0, max: 1 }): number {
  return Math.min(bounds.max, Math.max(bounds.min, score));
}
