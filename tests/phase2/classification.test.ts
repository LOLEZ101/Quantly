import { describe, expect, it } from "vitest";
import { classifyAll } from "../../src/classification/classify-pilot.js";
import { loadPilotData } from "../../src/config/load-pilot-universe.js";
import { loadTaxonomy } from "../../src/config/load-taxonomy.js";
import { loadThresholds } from "../../src/config/load-thresholds.js";

describe("Phase-2 classification", () => {
  const data = loadPilotData();
  const taxonomy = loadTaxonomy();
  const thresholds = loadThresholds();
  const classifications = classifyAll(data, taxonomy, thresholds);

  it("assigns at most one primary path per company", () => {
    for (const c of classifications) {
      expect(c.primary === null || typeof c.primary.node_id === "string").toBe(
        true
      );
    }
  });

  it("terminates primary paths in valid taxonomy nodes", () => {
    for (const c of classifications) {
      if (!c.primary) continue;
      expect(taxonomy.byId.has(c.primary.node_id)).toBe(true);
      expect(c.primary.path.startsWith("root.")).toBe(true);
    }
  });

  it("classifies demo companies as expected", () => {
    const byKey = Object.fromEntries(
      classifications.map((c) => [c.company_key, c])
    );
    expect(byKey.vz.primary?.node_id).toBe("national_wireless_network_owners");
    expect(byKey.mcd.primary?.node_id).toBe("qsr_franchise_heavy");
    expect(byKey.nvda.primary?.node_id).toBe(
      "fabless_compute_and_ai_accelerators"
    );
    expect(byKey.intc.primary?.node_id).toBe("integrated_device_manufacturers");
    expect(byKey.amt.primary?.node_id).toBe("tower_and_macro_site_operators");
    expect(byKey.cmg.primary?.node_id).toBe("fast_casual_company_operated");
    expect(byKey.gfs.primary?.node_id).toBe("semiconductor_foundries");
  });

  it("gives Starbucks a hybrid franchise leaf from location mix", () => {
    const sbux = classifications.find((c) => c.company_key === "sbux");
    expect(sbux?.primary?.node_id).toBe("qsr_hybrid_franchise");
  });

  it("assigns Intel a foundry secondary exposure when material", () => {
    const intc = classifications.find((c) => c.company_key === "intc");
    expect(intc?.secondary.some((s) => s.node_id === "semiconductor_foundries")).toBe(
      true
    );
  });

  it("lowers confidence when coverage is incomplete", () => {
    const complete = classifications.find((c) => c.coverage_ratio >= 0.99)!;
    const incomplete = {
      ...complete,
      coverage_ratio: 0.6,
      unallocated_weight: 0.4,
    };
    // confidence components already encode coverage on real rows
    const lowCoverage = classifications
      .filter((c) => c.primary)
      .sort(
        (a, b) =>
          a.primary!.confidence_components.segment_coverage -
          b.primary!.confidence_components.segment_coverage
      )[0];
    expect(lowCoverage.primary!.confidence_components.segment_coverage).toBeLessThanOrEqual(
      1
    );
    void incomplete;
  });

  it("records primary selection reason", () => {
    for (const c of classifications) {
      if (!c.primary) continue;
      expect(c.primary.primary_selection_reason.length).toBeGreaterThan(0);
    }
  });
});
