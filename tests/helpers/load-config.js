import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function repoPath(...parts) {
  return join(ROOT, ...parts);
}

export function loadYaml(relativePath) {
  const raw = readFileSync(repoPath(relativePath), "utf8");
  return parseYaml(raw);
}

export function loadJson(relativePath) {
  const raw = readFileSync(repoPath(relativePath), "utf8");
  return JSON.parse(raw);
}

export function buildTaxonomyIndex(taxonomy) {
  const byId = new Map();
  for (const node of taxonomy.nodes) {
    byId.set(node.id, node);
  }
  return byId;
}

export function computePaths(taxonomy) {
  const byId = buildTaxonomyIndex(taxonomy);
  const paths = new Map();

  function pathFor(id, stack = []) {
    if (paths.has(id)) return paths.get(id);
    if (stack.includes(id)) {
      throw new Error(`Cycle detected involving ${id}`);
    }
    const node = byId.get(id);
    if (!node) throw new Error(`Missing node ${id}`);
    if (node.parent_id == null) {
      paths.set(id, id);
      return id;
    }
    const parentPath = pathFor(node.parent_id, [...stack, id]);
    const path = `${parentPath}.${id}`;
    paths.set(id, path);
    return path;
  }

  for (const node of taxonomy.nodes) {
    pathFor(node.id);
  }
  return paths;
}

export function findTaxonomyCycles(taxonomy) {
  const byId = buildTaxonomyIndex(taxonomy);
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function dfs(id, stack) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = byId.get(id);
    if (node?.parent_id) {
      if (!byId.has(node.parent_id)) {
        cycles.push([id, `MISSING_PARENT:${node.parent_id}`]);
      } else {
        dfs(node.parent_id, [...stack, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const node of taxonomy.nodes) {
    dfs(node.id, []);
  }
  return cycles;
}

export function assertWeightSum(weights, tolerance = 0.001) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) <= tolerance;
}

/**
 * Application-level rule: historical (closed) records must not be mutated.
 * Simulates an append-only store for unit tests.
 */
export function applyExposureChange(store, change) {
  const active = store.filter(
    (row) =>
      row.company_id === change.company_id &&
      row.taxonomy_version === change.taxonomy_version &&
      row.exposure_kind === change.exposure_kind &&
      row.effective_to == null
  );

  for (const row of active) {
    if (Object.isFrozen(row)) {
      throw new Error("Historical records must not be overwritten");
    }
    row.effective_to = change.effective_from;
    Object.freeze(row);
  }

  const next = {
    company_id: change.company_id,
    taxonomy_version: change.taxonomy_version,
    exposure_kind: change.exposure_kind,
    node_id: change.node_id,
    weight: change.weight,
    confidence: change.confidence,
    is_manual: change.is_manual ?? false,
    effective_from: change.effective_from,
    effective_to: null,
  };
  store.push(next);
  return store;
}

export function countActivePrimaries(store, companyId, taxonomyVersion) {
  return store.filter(
    (row) =>
      row.company_id === companyId &&
      row.taxonomy_version === taxonomyVersion &&
      row.exposure_kind === "primary" &&
      row.effective_to == null
  ).length;
}

export function classificationHasValidEvidence(classification) {
  const primary = classification.primary_path;
  if (!primary) return true;
  if (primary.is_manual) return true;
  return Array.isArray(classification.evidence) && classification.evidence.length > 0;
}
