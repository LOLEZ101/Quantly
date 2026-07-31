import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../config/paths.js";
import { withClient } from "./client.js";

export interface MigrationInfo {
  id: string;
  file: string;
  sql: string;
}

export function listMigrations(): MigrationInfo[] {
  const dir = repoPath("database/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      id: file.replace(/\.sql$/, ""),
      file,
      sql: readFileSync(join(dir, file), "utf8"),
    }));
}

export async function getAppliedMigrations(): Promise<string[]> {
  await withClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  });
  const result = await withClient((client) =>
    client.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id")
  );
  return result.rows.map((r) => r.id);
}

export async function migrate(): Promise<{ applied: string[]; already: string[] }> {
  const migrations = listMigrations();
  const applied = new Set(await getAppliedMigrations());
  const newly: string[] = [];
  const already: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      already.push(migration.id);
      continue;
    }
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING",
          [migration.id]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
    newly.push(migration.id);
  }
  return { applied: newly, already };
}

export async function migrationStatus(): Promise<{
  pending: string[];
  applied: string[];
}> {
  const all = listMigrations().map((m) => m.id);
  let applied: string[] = [];
  try {
    applied = await getAppliedMigrations();
  } catch {
    applied = [];
  }
  const appliedSet = new Set(applied);
  return {
    applied,
    pending: all.filter((id) => !appliedSet.has(id)),
  };
}
