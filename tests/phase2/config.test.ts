import { describe, expect, it } from "vitest";
import { loadPeerEligibility } from "../../src/config/load-peer-eligibility.js";
import { loadPeerWeights, PHASE2_PEER_TYPES } from "../../src/config/load-peer-weights.js";
import { loadTaxonomy } from "../../src/config/load-taxonomy.js";
import { loadThresholds } from "../../src/config/load-thresholds.js";
import { loadPilotUniverse } from "../../src/config/load-pilot-universe.js";

describe("Phase-2 configuration", () => {
  const taxonomy = loadTaxonomy();
  const eligibility = loadPeerEligibility();
  const weights = loadPeerWeights();
  const thresholds = loadThresholds();
  const universe = loadPilotUniverse();

  it("loads peer-eligibility rules with existing taxonomy node references", () => {
    expect(eligibility.rules.length).toBeGreaterThan(5);
    for (const [, nodes] of Object.entries(eligibility.node_sets)) {
      for (const id of nodes) {
        expect(taxonomy.byId.has(id), id).toBe(true);
      }
    }
  });

  it("keeps thresholds in valid ranges", () => {
    expect(thresholds.franchise_mix.franchise_heavy_min_locations_pct).toBeGreaterThan(
      thresholds.franchise_mix.company_operated_heavy_max_locations_pct
    );
    expect(thresholds.segment_coverage.complete_min).toBeLessThanOrEqual(1);
    expect(thresholds.segment_coverage.moderate_review_min).toBeLessThan(
      thresholds.segment_coverage.usable_with_warning_min
    );
  });

  it("includes Phase-2 peer types with weights summing to 1", () => {
    for (const peerType of PHASE2_PEER_TYPES) {
      expect(weights.peer_types[peerType], peerType).toBeTruthy();
      const sum = Object.values(weights.peer_types[peerType].weights).reduce(
        (a, b) => a + b,
        0
      );
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
    }
  });

  it("pilot universe has 25–35 companies", () => {
    expect(universe.company_keys.length).toBeGreaterThanOrEqual(25);
    expect(universe.company_keys.length).toBeLessThanOrEqual(35);
  });

  it("retains Phase-1 peer types for contract compatibility", () => {
    for (const t of ["economic", "valuation", "competitive", "custom"]) {
      expect(weights.peer_types[t]).toBeTruthy();
    }
  });
});
