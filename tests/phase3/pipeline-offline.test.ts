import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runPhase3Pipeline } from "../../src/pipeline/run-phase3.js";
import { runPhase2Pipeline } from "../../src/pipeline/run-phase2.js";

describe("Phase-3 offline pipeline", () => {
  it("runs end-to-end offline and preserves Phase-2 regressions", async () => {
    const phase2 = runPhase2Pipeline({ exportSnapshot: true });
    expect(phase2.ok).toBe(true);

    const phase3 = await runPhase3Pipeline({ offline: true });
    expect(phase3.ok).toBe(true);
    expect(phase3.summary.companies_requested).toBe(30);
    expect(phase3.summary.companies_resolved).toBe(30);
    expect(existsSync("exports/snapshots/pilot-v2-sourced/manifest.json")).toBe(
      true
    );
    expect(existsSync("exports/snapshots/pilot-v1/manifest.json")).toBe(true);

    const manifest = JSON.parse(
      readFileSync("exports/snapshots/pilot-v2-sourced/manifest.json", "utf8")
    );
    expect(manifest.snapshot_id).toBe("snap_pilot_v2_sourced");
    expect(manifest.parent_snapshot_id).toBe("snap_pilot_v1");
    expect(manifest.publication_status).toBe("published");

    const demo = phase3.summary.demo as Record<
      string,
      {
        primary: string;
        top_direct_competitors: Array<{ peer: string }>;
      }
    >;
    expect(demo.vz.primary).toBe("national_wireless_network_owners");
    expect(demo.vz.top_direct_competitors.map((p) => p.peer)).toEqual(
      expect.arrayContaining(["t", "tmus"])
    );
    expect(demo.vz.top_direct_competitors.map((p) => p.peer)).not.toContain("amt");

    expect(demo.mcd.primary).toBe("qsr_franchise_heavy");
    expect(demo.nvda.primary).toBe("fabless_compute_and_ai_accelerators");
    expect(demo.nvda.top_direct_competitors[0].peer).toBe("amd");
    expect(demo.nvda.top_direct_competitors.map((p) => p.peer)).not.toContain(
      "amat"
    );
    expect(demo.intc.primary).toBe("integrated_device_manufacturers");
    expect(demo.amt.primary).toBe("tower_and_macro_site_operators");
    expect(demo.amt.top_direct_competitors.map((p) => p.peer)).toEqual(["cci"]);

    expect(existsSync("reports/phase3/identifier-reconciliation.json")).toBe(
      true
    );
    expect(existsSync("reports/phase3/fixture-reconciliation.json")).toBe(true);
    expect(existsSync("reports/phase3/illustrative-fallbacks.json")).toBe(true);
  }, 180000);

  it("is deterministic offline", async () => {
    const a = await runPhase3Pipeline({ offline: true });
    const b = await runPhase3Pipeline({ offline: true });
    expect(a.summary.facts_ingested).toBe(b.summary.facts_ingested);
    expect(a.summary.evidence_candidates).toBe(b.summary.evidence_candidates);
    expect(
      (a.summary.demo as { vz: { primary: string } }).vz.primary
    ).toBe((b.summary.demo as { vz: { primary: string } }).vz.primary);
  }, 180000);
});
