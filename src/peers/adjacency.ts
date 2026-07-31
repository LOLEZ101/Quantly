import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { repoPath } from "../config/paths.js";

export interface AdjacencyConfig {
  adjacency_version: string;
  taxonomy_version: string;
  relationships: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    strength: number;
    rationale: string;
  }>;
}

export function loadYamlAdjacency(
  path = repoPath("config/adjacent-categories.yaml")
): AdjacencyConfig {
  return parseYaml(readFileSync(path, "utf8")) as AdjacencyConfig;
}
