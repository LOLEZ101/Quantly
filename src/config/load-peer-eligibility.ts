import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { EligibilityResult, PeerType } from "../domain/types.js";
import { repoPath } from "./paths.js";

export interface EligibilityRule {
  id: string;
  description: string;
  when: {
    one_in?: string | string[];
    other_in?: string | string[];
    same_primary_node?: boolean;
  };
  peer_types: PeerType[];
  result: EligibilityResult;
  penalty?: number;
}

export interface PeerEligibilityConfig {
  version: string;
  effective_date: string;
  taxonomy_version: string;
  node_sets: Record<string, string[]>;
  peer_types: string[];
  rules: EligibilityRule[];
}

export function loadPeerEligibility(
  path = repoPath("config/peer-eligibility.yaml")
): PeerEligibilityConfig {
  return parseYaml(readFileSync(path, "utf8")) as PeerEligibilityConfig;
}

export function expandNodeRef(
  config: PeerEligibilityConfig,
  ref: string
): Set<string> {
  if (config.node_sets[ref]) return new Set(config.node_sets[ref]);
  return new Set([ref]);
}

export function expandNodeRefs(
  config: PeerEligibilityConfig,
  refs: string | string[] | undefined
): Set<string> {
  if (!refs) return new Set();
  const list = Array.isArray(refs) ? refs : [refs];
  const out = new Set<string>();
  for (const ref of list) {
    for (const id of expandNodeRef(config, ref)) out.add(id);
  }
  return out;
}
