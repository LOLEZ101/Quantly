import { describe, expect, it } from "vitest";
import { listMigrations } from "../../src/database/migration-runner.js";

const enabled = process.env.RUN_DB_TESTS === "true";

describe.skipIf(!enabled)("Optional PostgreSQL integration", () => {
  it("applies migrations including Phase-3.6 and persists a pipeline run", async () => {
    const { checkDatabaseConnectivity, closePool, getPool } = await import(
      "../../src/database/client.js"
    );
    const { migrate, migrationStatus } = await import(
      "../../src/database/migration-runner.js"
    );
    const { createPostgresUnitOfWork, finalizePipelineRunRecord } =
      await import("../../src/database/postgres-unit-of-work.js");

    expect(await checkDatabaseConnectivity()).toBe(true);
    const result = await migrate();
    expect(result.applied.length + result.already.length).toBe(
      listMigrations().length
    );
    const status = await migrationStatus();
    expect(status.pending).toEqual([]);
    expect(status.applied).toContain("003_phase36_pipeline_persistence");

    const runKey = `test_phase36_${Date.now()}`;
    const { uow, client, release } = await createPostgresUnitOfWork(
      getPool(),
      runKey
    );
    await uow.companies.upsertByKey({
      company_key: "vz",
      legal_name: "Verizon Communications Inc.",
      display_name: "Verizon",
      cik: "0000732712",
    });
    expect(await uow.companies.findByKey("vz")).not.toBeNull();
    await uow.classifications.replaceAll(
      [
        {
          company_key: "vz",
          primary: {
            node_id: "national_wireless_network_owners",
            path: "root.telecom",
            confidence: 0.9,
            evidence_ids: [],
          },
          secondary: [],
        } as never,
      ],
      runKey
    );
    const stored = await uow.classifications.list(runKey);
    expect(stored.length).toBe(1);
    await finalizePipelineRunRecord(client, runKey, {
      status: "succeeded",
      snapshotId: "snap_test",
      publicationStatus: "website_ready_not_official",
      summary: { ok: true },
    });
    release();
    await closePool();
  });
});

describe("Database integration placeholders (offline)", () => {
  it("documents optional RUN_DB_TESTS gate and Phase-3.6 migration", () => {
    expect(typeof enabled).toBe("boolean");
    const ids = listMigrations().map((m) => m.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain("003_phase36_pipeline_persistence");
  });
});
