import { describe, expect, it } from "vitest";
import {
  describeDatabaseUrl,
  parseRepositoryMode,
} from "../../src/database/repository-mode.js";
import {
  ACCEPTANCE_SET_KEYS,
  evaluateOfficialPublication,
} from "../../src/publication/official-publication.js";
import { runPhase37Pipeline } from "../../src/pipeline/run-phase3.7.js";

describe("Phase-3.7 repository mode and publication statuses", () => {
  it("parses repository modes and rejects invalid values", () => {
    expect(parseRepositoryMode("postgres")).toBe("postgres");
    expect(parseRepositoryMode("memory")).toBe("memory");
    expect(() => parseRepositoryMode("sqlite")).toThrow(/Invalid/);
  });

  it("describes DATABASE_URL without password", () => {
    const info = describeDatabaseUrl(
      "postgres://peer:secret@localhost:5432/peer_engine"
    );
    expect(info.host).toBe("localhost");
    expect(info.database).toBe("peer_engine");
    expect(info.user).toBe("peer");
    expect(JSON.stringify(info)).not.toContain("secret");
  });

  it("gates official_acceptance_set_verified and official_full_pilot_verified honestly", () => {
    const acceptance = evaluateOfficialPublication(
      {
        criticalBlocks: [],
        contractErrors: [],
        fieldProvenanceDocumented: true,
        circularProvenanceDetected: false,
        illustrativePeerBandCount: 0,
        missingIdentifierCount: 0,
        highSeverityReviewCount: 0,
        persistenceBackend: "postgres",
        persistenceComplete: true,
        postgresE2EComplete: true,
        liveEdgarFullFinancialCount: 5,
        companyCount: 30,
        liveEdgarAcceptanceSetCount: ACCEPTANCE_SET_KEYS.length,
        acceptanceSetSize: ACCEPTANCE_SET_KEYS.length,
        websiteReadinessPassed: true,
        unsupportedPeerTypesIncluded: [],
      },
      "2026-07-31T20:00:00.000Z"
    );
    expect(acceptance.publication_status).toBe(
      "official_acceptance_set_verified"
    );
    expect(acceptance.official).toBe(true);
    expect(acceptance.publishable).toBe(false);

    const full = evaluateOfficialPublication(
      {
        criticalBlocks: [],
        contractErrors: [],
        fieldProvenanceDocumented: true,
        circularProvenanceDetected: false,
        illustrativePeerBandCount: 0,
        missingIdentifierCount: 0,
        highSeverityReviewCount: 0,
        persistenceBackend: "postgres",
        persistenceComplete: true,
        postgresE2EComplete: true,
        liveEdgarFullFinancialCount: 30,
        companyCount: 30,
        liveEdgarAcceptanceSetCount: 5,
        acceptanceSetSize: 5,
        websiteReadinessPassed: true,
        unsupportedPeerTypesIncluded: [],
      },
      "2026-07-31T20:00:00.000Z"
    );
    expect(full.publication_status).toBe("official_full_pilot_verified");
    expect(full.publishable).toBe(true);
  });

  it("fails clearly when postgres is requested but unavailable", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://peer:peer@127.0.0.1:1/peer_engine";
    await expect(
      runPhase37Pipeline({
        repository: "postgres",
        liveEdgar: false,
        acceptanceSetOnly: true,
        skipSnapshot: true,
      })
    ).rejects.toThrow(/not reachable|Refusing silent memory fallback|DATABASE_URL/i);
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }, 30000);

  it("runs memory offline acceptance without claiming official status", async () => {
    // skipSnapshot: do not clobber exports/snapshots/pilot-v5-operational
    const result = await runPhase37Pipeline({
      repository: "memory",
      liveEdgar: false,
      acceptanceSetOnly: true,
      skipSnapshot: true,
    });
    expect(result.ok).toBe(true);
    expect(result.summary.repository_mode).toBe("memory");
    expect(result.summary.postgres_e2e_complete).toBe(false);
    const publication = result.summary.publication as {
      publication_status: string;
      official: boolean;
    };
    expect(publication.official).toBe(false);
    expect(publication.publication_status).not.toBe(
      "official_acceptance_set_verified"
    );
    expect(publication.publication_status).not.toBe(
      "official_full_pilot_verified"
    );
  }, 180000);
});
