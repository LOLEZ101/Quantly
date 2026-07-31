import { loadTaxonomy } from "../config/load-taxonomy.js";

export function validateTaxonomyConfig(): string[] {
  const errors: string[] = [];
  try {
    const index = loadTaxonomy();
    const ids = index.config.nodes.map((n) => n.id);
    if (new Set(ids).size !== ids.length) errors.push("Duplicate taxonomy node ids");
    for (const node of index.config.nodes) {
      if (node.parent_id && !index.byId.has(node.parent_id)) {
        errors.push(`Missing parent for ${node.id}`);
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return errors;
}
