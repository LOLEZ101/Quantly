import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { TaxonomyNode } from "../domain/types.js";
import { repoPath } from "./paths.js";

export interface TaxonomyConfig {
  taxonomy_version: string;
  effective_date: string;
  description?: string;
  nodes: TaxonomyNode[];
}

export interface TaxonomyIndex {
  config: TaxonomyConfig;
  byId: Map<string, TaxonomyNode>;
  children: Map<string | null, TaxonomyNode[]>;
  paths: Map<string, string>;
}

export function loadTaxonomy(path = repoPath("config/taxonomy.yaml")): TaxonomyIndex {
  const config = parseYaml(readFileSync(path, "utf8")) as TaxonomyConfig;
  const byId = new Map<string, TaxonomyNode>();
  for (const node of config.nodes) {
    byId.set(node.id, { ...node });
  }

  const paths = new Map<string, string>();
  function pathFor(id: string, stack: string[] = []): string {
    if (paths.has(id)) return paths.get(id)!;
    if (stack.includes(id)) throw new Error(`Taxonomy cycle at ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`Missing taxonomy node ${id}`);
    if (!node.parent_id) {
      paths.set(id, id);
      node.path = id;
      node.depth = 0;
      return id;
    }
    const parentPath = pathFor(node.parent_id, [...stack, id]);
    const path = `${parentPath}.${id}`;
    paths.set(id, path);
    node.path = path;
    node.depth = path.split(".").length - 1;
    return path;
  }
  for (const node of config.nodes) pathFor(node.id);

  const children = new Map<string | null, TaxonomyNode[]>();
  for (const node of config.nodes) {
    const key = node.parent_id;
    const list = children.get(key) ?? [];
    list.push(node);
    children.set(key, list);
  }

  return { config, byId, children, paths };
}

export function ancestorsOf(index: TaxonomyIndex, nodeId: string): TaxonomyNode[] {
  const out: TaxonomyNode[] = [];
  let current = index.byId.get(nodeId);
  while (current) {
    out.unshift(current);
    current = current.parent_id ? index.byId.get(current.parent_id) : undefined;
  }
  return out;
}

export function parentId(index: TaxonomyIndex, nodeId: string): string | null {
  return index.byId.get(nodeId)?.parent_id ?? null;
}
