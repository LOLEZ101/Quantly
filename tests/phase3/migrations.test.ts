import { describe, expect, it } from "vitest";
import { listMigrations } from "../../src/database/migration-runner.js";

describe("Phase-3 migrations", () => {
  it("lists ordered SQL migrations", () => {
    const migrations = listMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(2);
    expect(migrations[0].id).toBe("001_baseline_schema");
    expect(migrations[1].id).toBe("002_phase3_source_layer");
    const ids = migrations.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("includes source layer tables in migration SQL", () => {
    const sql = listMigrations()
      .map((m) => m.sql)
      .join("\n");
    for (const table of [
      "source_payloads",
      "financial_facts",
      "financial_fact_conflicts",
      "filing_sections",
      "evidence_candidates",
      "identifier_resolutions",
    ]) {
      expect(sql).toContain(table);
    }
  });

  it("preserves append-only / uniqueness patterns", () => {
    const baseline = listMigrations()[0].sql;
    expect(baseline).toContain("company_node_exposures_one_primary_uid");
    expect(baseline).toContain("effective_to");
  });
});
