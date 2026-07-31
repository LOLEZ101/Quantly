import { describe, expect, it } from "vitest";
import { classifyAll } from "../../src/classification/classify-pilot.js";
import { loadPeerEligibility } from "../../src/config/load-peer-eligibility.js";
import { loadPeerWeights } from "../../src/config/load-peer-weights.js";
import { loadPilotData } from "../../src/config/load-pilot-universe.js";
import { loadTaxonomy } from "../../src/config/load-taxonomy.js";
import { loadThresholds } from "../../src/config/load-thresholds.js";
import { applyEligibilityRules } from "../../src/peers/apply-eligibility-rules.js";
import { buildPeerGraph } from "../../src/peers/build-peer-graph.js";
import { checkReciprocity } from "../../src/peers/check-reciprocity.js";
import { generateCandidates } from "../../src/peers/generate-candidates.js";

describe("Phase-2 peers", () => {
  const data = loadPilotData();
  const taxonomy = loadTaxonomy();
  const thresholds = loadThresholds();
  const weights = loadPeerWeights();
  const eligibility = loadPeerEligibility();
  const classifications = classifyAll(data, taxonomy, thresholds);
  const classMap = new Map(classifications.map((c) => [c.company_key, c]));
  const peers = buildPeerGraph({
    data,
    classifications,
    taxonomy,
    weights,
    eligibility,
    thresholds,
  });

  it("includes same-node candidates with reasons", () => {
    const cands = generateCandidates({
      targetKey: "vz",
      classifications: classMap,
      data,
      taxonomy,
    });
    const tmus = cands.find((c) => c.peer_company_id === "tmus");
    expect(tmus?.reasons).toContain("same_terminal_taxonomy_node");
    expect(tmus?.reasons.length).toBeGreaterThan(0);
  });

  it("marks adjacent-node candidates with a reason", () => {
    const cands = generateCandidates({
      targetKey: "vz",
      classifications: classMap,
      data,
      taxonomy,
    });
    const cable = cands.find((c) => c.peer_company_id === "cmcsa");
    expect(cable?.reasons).toContain("adjacent_taxonomy_node");
  });

  it("excludes tower vs carrier as direct competitors", () => {
    const decision = applyEligibilityRules({
      targetNodeId: "national_wireless_network_owners",
      peerNodeId: "tower_and_macro_site_operators",
      peerType: "direct_competitor",
      config: eligibility,
    });
    expect(decision.result).toBe("ineligible");

    const bad = peers.filter(
      (p) =>
        p.peer_type === "direct_competitor" &&
        ((p.target_company_id === "vz" && p.peer_company_id === "amt") ||
          (p.target_company_id === "amt" && p.peer_company_id === "vz"))
    );
    expect(bad).toHaveLength(0);
  });

  it("excludes equipment vs chip designers as direct competitors", () => {
    const decision = applyEligibilityRules({
      targetNodeId: "fabless_compute_and_ai_accelerators",
      peerNodeId: "etch_deposition_and_clean",
      peerType: "direct_competitor",
      config: eligibility,
    });
    expect(decision.result).toBe("ineligible");
    expect(
      peers.some(
        (p) =>
          p.peer_type === "direct_competitor" &&
          p.target_company_id === "nvda" &&
          (p.peer_company_id === "amat" || p.peer_company_id === "lrcx")
      )
    ).toBe(false);
  });

  it("keeps scores in [0,1] and ranks deterministically", () => {
    for (const p of peers) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(1);
      expect(p.rank).toBeGreaterThan(0);
    }
    const vzDirect = peers
      .filter(
        (p) =>
          p.target_company_id === "vz" && p.peer_type === "direct_competitor"
      )
      .map((p) => p.peer_company_id);
    const again = buildPeerGraph({
      data,
      classifications,
      taxonomy,
      weights,
      eligibility,
      thresholds,
    })
      .filter(
        (p) =>
          p.target_company_id === "vz" && p.peer_type === "direct_competitor"
      )
      .map((p) => p.peer_company_id);
    expect(again).toEqual(vzDirect);
  });

  it("penalizes IDM vs fabless operating comparisons", () => {
    const decision = applyEligibilityRules({
      targetNodeId: "integrated_device_manufacturers",
      peerNodeId: "fabless_compute_and_ai_accelerators",
      peerType: "operating",
      config: eligibility,
    });
    expect(decision.result).toBe("eligible_with_penalty");
    expect(decision.penalty).toBeGreaterThan(0);
  });

  it("supports reciprocity inspection", () => {
    const recip = checkReciprocity({
      companyA: "vz",
      companyB: "t",
      peerType: "direct_competitor",
      relationships: peers,
    });
    expect(["mutual_peer", "one_way_peer", "none"]).toContain(
      recip.relationship
    );
  });

  it("demo peer expectations", () => {
    const top = (key: string) =>
      peers
        .filter(
          (p) =>
            p.target_company_id === key && p.peer_type === "direct_competitor"
        )
        .sort((a, b) => a.rank - b.rank)
        .map((p) => p.peer_company_id);

    const vz = top("vz");
    expect(vz.slice(0, 2).sort()).toEqual(["t", "tmus"].sort());
    expect(vz).not.toContain("amt");
    expect(vz).not.toContain("cci");

    const mcd = top("mcd");
    expect(mcd).toContain("yum");
    expect(mcd).toContain("qsr");
    const cmgRank = peers.find(
      (p) =>
        p.target_company_id === "mcd" &&
        p.peer_company_id === "cmg" &&
        p.peer_type === "direct_competitor"
    )?.rank;
    const yumRank = peers.find(
      (p) =>
        p.target_company_id === "mcd" &&
        p.peer_company_id === "yum" &&
        p.peer_type === "direct_competitor"
    )?.rank;
    if (cmgRank && yumRank) expect(cmgRank).toBeGreaterThan(yumRank);

    const nvda = top("nvda");
    expect(nvda[0]).toBe("amd");
    expect(nvda).not.toContain("amat");
    expect(nvda).not.toContain("gfs");

    const amt = top("amt");
    expect(amt).toEqual(["cci"]);
  });

  it("builds explanations with similarities and differences", () => {
    const rel = peers.find(
      (p) =>
        p.target_company_id === "vz" &&
        p.peer_company_id === "tmus" &&
        p.peer_type === "direct_competitor"
    )!;
    expect(rel.explanation.similarities.length).toBeGreaterThan(0);
    expect(rel.explanation.differences.length).toBeGreaterThan(0);
    expect(rel.explanation.limitations.some((l) => /manually curated/i.test(l))).toBe(
      true
    );
    expect(rel.candidate_reasons.length).toBeGreaterThan(0);
  });
});
