#!/usr/bin/env node
import { migrate, migrationStatus, listMigrations } from "../database/migration-runner.js";
import { checkDatabaseConnectivity, closePool } from "../database/client.js";
import { loadEnvConfig } from "../database/env.js";
import { parseRepositoryMode } from "../database/repository-mode.js";
import { runPhase3Pipeline } from "../pipeline/run-phase3.js";
import { runPhase35Pipeline } from "../pipeline/run-phase3.5.js";
import { runPhase36Pipeline } from "../pipeline/run-phase3.6.js";
import { runPhase37Pipeline } from "../pipeline/run-phase3.7.js";
import { seedRawCacheFromFixtures } from "../sources/raw-cache.js";
import { createSecAdapter } from "../sources/sec/live-adapter.js";
import { loadPilotData } from "../config/load-pilot-universe.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const cmd = process.argv[2] ?? "phase3";

async function main() {
  const offline = hasFlag("--offline") || cmd !== "ingest:live";

  if (cmd === "db:status") {
    const status = await migrationStatus();
    console.log(JSON.stringify({ migrations: listMigrations().map((m) => m.id), ...status }, null, 2));
    return;
  }

  if (cmd === "db:migrate") {
    const env = loadEnvConfig();
    if (!env.databaseUrl) {
      console.log(JSON.stringify({
        ok: true,
        mode: "dry-run",
        migrations: listMigrations().map((m) => m.id),
        note: "DATABASE_URL not set; listing migrations only. Start Postgres with npm run db:up then retry.",
      }, null, 2));
      return;
    }
    const ok = await checkDatabaseConnectivity();
    if (!ok) throw new Error("Database not reachable");
    const result = await migrate();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    await closePool();
    return;
  }

  if (cmd === "identifiers" || cmd === "identifiers:pilot") {
    const data = loadPilotData();
    const adapter = createSecAdapter(true, {
      corpus: hasFlag("--verified") ? "verified_independent" : "legacy_circular",
    });
    const ticker = argValue("--ticker");
    const companies = ticker
      ? data.companies.filter((c) => c.ticker === ticker.toUpperCase())
      : data.companies;
    const resolutions = [];
    for (const c of companies) {
      resolutions.push(
        await adapter.resolveCompanyIdentifiers({
          company_key: c.company_key,
          legal_name: c.legal_name,
          display_name: c.display_name,
          ticker: c.ticker,
          exchange: c.exchange,
          cik: c.cik,
        })
      );
    }
    console.log(JSON.stringify({ count: resolutions.length, resolutions }, null, 2));
    return;
  }

  if (cmd === "cache:seed") {
    const corpus = hasFlag("--verified")
      ? "verified_independent"
      : "legacy_circular";
    const n = seedRawCacheFromFixtures(corpus);
    console.log(JSON.stringify({ ok: true, corpus, cached_objects: n }, null, 2));
    return;
  }

  if (
    cmd === "phase3.7" ||
    cmd === "phase3.7:operational" ||
    cmd === "snapshot:operational-pilot"
  ) {
    const repository = parseRepositoryMode(
      argValue("--repository"),
      hasFlag("--memory") ? "memory" : "postgres"
    );
    const liveEdgar = hasFlag("--live-edgar") || !hasFlag("--offline");
    // Default Phase 3.7 operational command: postgres + live edgar + acceptance set first.
    const acceptanceSetOnly =
      hasFlag("--acceptance-set") || !hasFlag("--full-pilot");
    const result = await runPhase37Pipeline({
      repository,
      liveEdgar,
      acceptanceSetOnly,
      ticker: argValue("--ticker"),
    });
    console.log(JSON.stringify({ ok: result.ok, summary: result.summary }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (
    cmd === "phase3.6" ||
    cmd === "phase3.6:acceptance" ||
    cmd === "snapshot:official-pilot"
  ) {
    const repository = argValue("--repository");
    const result = await runPhase36Pipeline({
      offline,
      preferPostgres:
        repository === "postgres"
          ? true
          : repository === "memory"
            ? false
            : !hasFlag("--memory"),
      ticker: argValue("--ticker"),
    });
    console.log(JSON.stringify({ ok: result.ok, summary: result.summary }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (
    cmd === "phase3.5" ||
    cmd === "phase3.5:verified" ||
    cmd === "snapshot:verified-pilot"
  ) {
    const result = await runPhase35Pipeline({
      offline,
      ticker: argValue("--ticker"),
    });
    console.log(JSON.stringify({ ok: result.ok, summary: result.summary }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (
    cmd === "phase3" ||
    cmd === "phase3:pilot" ||
    cmd === "ingest:pilot" ||
    cmd === "normalize:pilot" ||
    cmd === "extract:evidence:pilot" ||
    cmd === "reconcile:pilot" ||
    cmd === "classify:sourced-pilot" ||
    cmd === "peers:sourced-pilot" ||
    cmd === "review:sourced-pilot" ||
    cmd === "snapshot:sourced-pilot" ||
    cmd === "ingest:company" ||
    cmd === "reconcile:company" ||
    cmd === "classify:company"
  ) {
    const result = await runPhase3Pipeline({
      offline,
      ticker: argValue("--ticker"),
    });
    console.log(JSON.stringify({ ok: result.ok, summary: result.summary }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
