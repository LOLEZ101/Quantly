import { describe, expect, it } from "vitest";
import {
  assertWeightSum,
  buildTaxonomyIndex,
  computePaths,
  findTaxonomyCycles,
  loadYaml,
} from "./helpers/load-config.js";

const REQUIRED_NODE_FIELDS = [
  "id",
  "name",
  "description",
  "node_type",
  "parent_id",
  "inclusion_criteria",
  "exclusion_criteria",
  "allowed_child_node_types",
  "effective_date",
  "taxonomy_version",
];

const PILOT_LEAVES = {
  telecommunications: [
    "national_wireless_network_owners",
    "regional_wireless_operators",
    "wireless_mvno_and_resellers",
    "cable_broadband_operators",
    "fiber_network_operators",
    "integrated_incumbent_telcos",
    "tower_and_macro_site_operators",
    "wholesale_fiber_and_backhaul",
    "enterprise_network_and_connectivity",
    "collaboration_and_ucaas",
  ],
  restaurants: [
    "qsr_franchise_heavy",
    "qsr_company_operated",
    "fast_casual_franchise_heavy",
    "fast_casual_company_operated",
    "casual_dining",
    "fine_dining_and_upscale",
    "restaurant_franchisors_asset_light",
  ],
  semiconductors_and_equipment: [
    "fabless_compute_and_ai_accelerators",
    "fabless_mobile_and_consumer_soc",
    "fabless_connectivity_and_networking",
    "integrated_device_manufacturers",
    "semiconductor_foundries",
    "dram_manufacturers",
    "nand_and_other_memory",
    "analog_mixed_signal_and_power",
    "lithography_equipment",
    "etch_deposition_and_clean",
    "process_control_and_metrology",
    "assembly_test_and_packaging_equipment",
  ],
};

describe("taxonomy.yaml", () => {
  const taxonomy = loadYaml("config/taxonomy.yaml");
  const byId = buildTaxonomyIndex(taxonomy);

  it("has a taxonomy version and nodes array", () => {
    expect(taxonomy.taxonomy_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(taxonomy.nodes)).toBe(true);
    expect(taxonomy.nodes.length).toBeGreaterThan(20);
  });

  it("requires unique node IDs", () => {
    const ids = taxonomy.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires every node to include mandatory fields", () => {
    for (const node of taxonomy.nodes) {
      for (const field of REQUIRED_NODE_FIELDS) {
        expect(node, node.id).toHaveProperty(field);
      }
      expect(Array.isArray(node.inclusion_criteria)).toBe(true);
      expect(node.inclusion_criteria.length).toBeGreaterThan(0);
      expect(Array.isArray(node.exclusion_criteria)).toBe(true);
      expect(Array.isArray(node.allowed_child_node_types)).toBe(true);
      expect(node.taxonomy_version).toBe(taxonomy.taxonomy_version);
    }
  });

  it("requires parent nodes to exist (except root)", () => {
    for (const node of taxonomy.nodes) {
      if (node.parent_id == null) {
        expect(node.node_type).toBe("root");
        expect(node.id).toBe("root");
        continue;
      }
      expect(byId.has(node.parent_id), `${node.id} parent`).toBe(true);
    }
  });

  it("contains no taxonomy cycles", () => {
    expect(findTaxonomyCycles(taxonomy)).toEqual([]);
    expect(() => computePaths(taxonomy)).not.toThrow();
  });

  it("enforces allowed child node types", () => {
    for (const node of taxonomy.nodes) {
      if (!node.parent_id) continue;
      const parent = byId.get(node.parent_id);
      expect(parent.allowed_child_node_types).toContain(node.node_type);
    }
  });

  it("allows variable depth across branches", () => {
    const paths = computePaths(taxonomy);
    const depths = [...paths.values()].map((p) => p.split(".").length - 1);
    expect(new Set(depths).size).toBeGreaterThan(2);
  });

  it("includes detailed pilot leaves for the three pilot areas", () => {
    for (const [branch, leaves] of Object.entries(PILOT_LEAVES)) {
      expect(byId.has(branch), branch).toBe(true);
      for (const leaf of leaves) {
        expect(byId.has(leaf), leaf).toBe(true);
        expect(byId.get(leaf).node_type).toBe("peer_cluster");
      }
    }
  });
});

describe("peer-weights.yaml", () => {
  const weights = loadYaml("config/peer-weights.yaml");

  it("keeps peer scores bounded to [0, 1]", () => {
    expect(weights.score_bounds.min).toBe(0);
    expect(weights.score_bounds.max).toBe(1);
  });

  it("requires each peer-type weight profile to sum to 1.0", () => {
    for (const [peerType, profile] of Object.entries(weights.peer_types)) {
      expect(assertWeightSum(profile.weights), peerType).toBe(true);
      for (const value of Object.values(profile.weights)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("adjacent-categories.yaml", () => {
  const taxonomy = loadYaml("config/taxonomy.yaml");
  const adjacency = loadYaml("config/adjacent-categories.yaml");
  const byId = buildTaxonomyIndex(taxonomy);

  it("references existing taxonomy nodes with unique relationship ids", () => {
    const ids = adjacency.relationships.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const rel of adjacency.relationships) {
      expect(byId.has(rel.source_node_id), rel.source_node_id).toBe(true);
      expect(byId.has(rel.target_node_id), rel.target_node_id).toBe(true);
      expect(rel.source_node_id).not.toBe(rel.target_node_id);
      expect(rel.strength).toBeGreaterThanOrEqual(0);
      expect(rel.strength).toBeLessThanOrEqual(1);
    }
  });

  it("matches the declared taxonomy version", () => {
    expect(adjacency.taxonomy_version).toBe(taxonomy.taxonomy_version);
  });
});
