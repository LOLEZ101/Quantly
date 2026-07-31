import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createReadOnlyApiServer } from "../../src/api/read-only-server.js";
import { SnapshotStore } from "../../src/api/snapshot-store.js";

describe("Phase-4 read-only snapshot API", () => {
  const store = new SnapshotStore("pilot-v5-operational");
  const api = createReadOnlyApiServer({
    snapshotName: "pilot-v5-operational",
    host: "127.0.0.1",
    port: 18787,
  });

  beforeAll(async () => {
    await api.start();
  });

  afterAll(async () => {
    await api.stop();
  });

  it("loads pilot-v5-operational publication meta honestly", () => {
    const meta = store.publicationMeta();
    expect(meta.snapshot_id).toBe("snap_pilot_v5_operational");
    expect(meta.publication_status).toBe("official_full_pilot_verified");
    expect(meta.live_edgar_full_financial).toBe(30);
    expect(meta.live_edgar_acceptance_set).toBe(5);
    expect(meta.official).toBe(true);
    expect(meta.publishable).toBe(true);
  });

  it("serves health, taxonomy, company, and peers over HTTP", async () => {
    const base = "http://127.0.0.1:18787";
    const health = await fetch(`${base}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.mode).toBe("read-only");

    const meta = await fetch(`${base}/v1/meta/publication`).then((r) =>
      r.json()
    );
    expect(meta.publication_status).toBe("official_full_pilot_verified");

    const taxonomy = await fetch(`${base}/v1/taxonomy`).then((r) => r.json());
    expect(taxonomy.response_type || taxonomy.root || taxonomy.nodes).toBeTruthy();

    const company = await fetch(`${base}/v1/companies/VZ`).then((r) =>
      r.json()
    );
    expect(company.company_key || company.ticker || company._pilot).toBeTruthy();

    const peers = await fetch(`${base}/v1/companies/VZ/peers`).then((r) =>
      r.json()
    );
    expect(peers).toBeTruthy();

    const missing = await fetch(`${base}/v1/companies/NOTREAL`);
    expect(missing.status).toBe(404);
  });
});
