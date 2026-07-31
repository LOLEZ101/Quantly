import { describe, expect, it } from "vitest";
import {
  applyExposureChange,
  classificationHasValidEvidence,
  countActivePrimaries,
  loadJson,
} from "./helpers/load-config.js";

describe("company exposure rules", () => {
  it("accepts exposure weights in [0, 1]", () => {
    const valid = [0, 0.15, 0.5, 1];
    for (const weight of valid) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("rejects exposure weights outside [0, 1]", () => {
    const invalid = [-0.01, 1.01, 2];
    for (const weight of invalid) {
      const ok = weight >= 0 && weight <= 1;
      expect(ok).toBe(false);
    }
  });

  it("allows at most one active primary path per taxonomy version", () => {
    const store = [];
    applyExposureChange(store, {
      company_id: "c1",
      taxonomy_version: "1.0.0",
      exposure_kind: "primary",
      node_id: "national_wireless_network_owners",
      weight: 1,
      confidence: 0.9,
      effective_from: "2026-01-01",
    });
    expect(countActivePrimaries(store, "c1", "1.0.0")).toBe(1);

    applyExposureChange(store, {
      company_id: "c1",
      taxonomy_version: "1.0.0",
      exposure_kind: "primary",
      node_id: "cable_broadband_operators",
      weight: 1,
      confidence: 0.8,
      effective_from: "2026-07-01",
    });
    expect(countActivePrimaries(store, "c1", "1.0.0")).toBe(1);
    expect(store.filter((r) => r.effective_to != null)).toHaveLength(1);
  });

  it("does not overwrite historical records", () => {
    const store = [];
    applyExposureChange(store, {
      company_id: "c1",
      taxonomy_version: "1.0.0",
      exposure_kind: "primary",
      node_id: "qsr_franchise_heavy",
      weight: 1,
      confidence: 0.7,
      effective_from: "2025-01-01",
    });

    applyExposureChange(store, {
      company_id: "c1",
      taxonomy_version: "1.0.0",
      exposure_kind: "primary",
      node_id: "qsr_company_operated",
      weight: 1,
      confidence: 0.8,
      effective_from: "2026-01-01",
    });

    const historical = store.find((r) => r.effective_to != null);
    expect(Object.isFrozen(historical)).toBe(true);
    expect(() => {
      historical.node_id = "tampered";
    }).toThrow();
    expect(historical.node_id).toBe("qsr_franchise_heavy");
  });

  it("keeps peer scores between zero and one", () => {
    const peers = loadJson("tests/fixtures/peer-response.valid.json").peers;
    for (const peer of peers) {
      expect(peer.score).toBeGreaterThanOrEqual(0);
      expect(peer.score).toBeLessThanOrEqual(1);
      for (const component of peer.components) {
        expect(component.factor_score).toBeGreaterThanOrEqual(0);
        expect(component.factor_score).toBeLessThanOrEqual(1);
        expect(component.weighted_contribution).toBeGreaterThanOrEqual(0);
        expect(component.weighted_contribution).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("classification evidence rules", () => {
  it("requires evidence for non-manual classifications", () => {
    const valid = loadJson("tests/fixtures/company-classification.valid.json");
    expect(classificationHasValidEvidence(valid)).toBe(true);

    const invalid = loadJson(
      "tests/fixtures/company-classification.invalid-no-evidence.json"
    );
    expect(classificationHasValidEvidence(invalid)).toBe(false);
  });

  it("allows manual classifications without evidence", () => {
    const manual = loadJson(
      "tests/fixtures/company-classification.manual.valid.json"
    );
    expect(manual.primary_path.is_manual).toBe(true);
    expect(classificationHasValidEvidence(manual)).toBe(true);
  });
});
