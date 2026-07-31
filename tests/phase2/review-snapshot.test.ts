import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runPhase2Pipeline } from "../../src/pipeline/run-phase2.js";
import { validateSnapshotManifest } from "../../src/validation/validate-outputs.js";

describe("Phase-2 review queue and snapshots", () => {
  const first = runPhase2Pipeline({ exportSnapshot: true });

  it("creates review items for sparse or coverage issues when applicable", () => {
    expect(first.reviewItems.length).toBeGreaterThan(0);
    for (const item of first.reviewItems) {
      expect(item.review_item_id).toBeTruthy();
      expect(item.reason_code).toBeTruthy();
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.suggested_action.length).toBeGreaterThan(0);
      expect(["pending", "in_review", "approved", "rejected", "cancelled"]).toContain(
        item.status
      );
    }
  });

  it("exports a publishable snapshot with contract-valid manifest", () => {
    expect(first.snapshot.validation.publishable).toBe(true);
    expect(first.snapshot.validation.errors).toEqual([]);
    const manifest = JSON.parse(
      readFileSync(`${first.snapshot.snapshotDir}/manifest.json`, "utf8")
    );
    const {
      snapshot_type,
      fixture_data_version,
      validation_status,
      known_limitations,
      ...contract
    } = manifest;
    void snapshot_type;
    void fixture_data_version;
    void validation_status;
    void known_limitations;
    expect(validateSnapshotManifest(contract)).toEqual([]);
    expect(manifest.counts.companies).toBe(first.summary.companies);
  });

  it("is deterministic across two runs", () => {
    const second = runPhase2Pipeline({ exportSnapshot: true });
    const hash = (dir: string, file: string) =>
      createHash("sha256")
        .update(readFileSync(`${dir}/${file}`))
        .digest("hex");

    expect(hash(first.snapshot.snapshotDir, "companies.json")).toBe(
      hash(second.snapshot.snapshotDir, "companies.json")
    );
    expect(hash(first.snapshot.snapshotDir, "review-queue.json")).toBe(
      hash(second.snapshot.snapshotDir, "review-queue.json")
    );
    expect(first.peers.map((p) => `${p.target_company_id}:${p.peer_company_id}:${p.peer_type}:${p.score}:${p.rank}`)).toEqual(
      second.peers.map((p) => `${p.target_company_id}:${p.peer_company_id}:${p.peer_type}:${p.score}:${p.rank}`)
    );
  });

  it("classifies every company or leaves an explicit review item", () => {
    for (const cls of first.classifications) {
      if (!cls.primary) {
        expect(
          first.reviewItems.some(
            (r) =>
              r.company_key === cls.company_key &&
              r.reason_code === "no_primary_path"
          )
        ).toBe(true);
      }
    }
    expect(
      first.classifications.every((c) => c.primary != null)
    ).toBe(true);
  });
});
