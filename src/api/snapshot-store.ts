import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "../config/paths.js";

export type SnapshotName =
  | "pilot-v1"
  | "pilot-v2-sourced"
  | "pilot-v3-verified"
  | "pilot-v4-official"
  | "pilot-v5-operational";

const DEFAULT_SNAPSHOT: SnapshotName = "pilot-v5-operational";

export function resolveSnapshotDir(
  name = process.env.SNAPSHOT_NAME ?? DEFAULT_SNAPSHOT
): string {
  const dir = repoPath("exports/snapshots", name);
  if (!existsSync(join(dir, "manifest.json"))) {
    throw new Error(
      `Snapshot not found or incomplete: ${dir} (missing manifest.json)`
    );
  }
  return dir;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export class SnapshotStore {
  readonly snapshotDir: string;
  readonly snapshotName: string;

  constructor(snapshotName?: string) {
    const name = snapshotName ?? process.env.SNAPSHOT_NAME ?? DEFAULT_SNAPSHOT;
    this.snapshotName = name;
    this.snapshotDir = resolveSnapshotDir(name);
  }

  manifest(): unknown {
    return readJson(join(this.snapshotDir, "manifest.json"));
  }

  taxonomy(): unknown {
    return readJson(join(this.snapshotDir, "taxonomy.json"));
  }

  tree(): unknown {
    return readJson(join(this.snapshotDir, "tree.json"));
  }

  companiesIndex(): unknown {
    return readJson(join(this.snapshotDir, "companies.json"));
  }

  company(ticker: string): unknown {
    const path = join(this.snapshotDir, "company", `${ticker.toUpperCase()}.json`);
    if (!existsSync(path)) {
      throw Object.assign(new Error(`Company not found: ${ticker}`), {
        statusCode: 404,
      });
    }
    return readJson(path);
  }

  peers(ticker: string): unknown {
    const path = join(this.snapshotDir, "peers", `${ticker.toUpperCase()}.json`);
    if (!existsSync(path)) {
      throw Object.assign(new Error(`Peers not found: ${ticker}`), {
        statusCode: 404,
      });
    }
    return readJson(path);
  }

  sources(ticker: string): unknown | null {
    const path = join(this.snapshotDir, "sources", `${ticker.toUpperCase()}.json`);
    if (!existsSync(path)) return null;
    return readJson(path);
  }

  evidence(ticker: string): unknown | null {
    const path = join(
      this.snapshotDir,
      "evidence",
      `${ticker.toUpperCase()}.json`
    );
    if (!existsSync(path)) return null;
    return readJson(path);
  }

  optionalArtifact(name: string): unknown | null {
    const path = join(this.snapshotDir, name);
    if (!existsSync(path)) return null;
    return readJson(path);
  }

  listCompanyTickers(): string[] {
    const dir = join(this.snapshotDir, "company");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  }

  publicationMeta(): Record<string, unknown> {
    const manifest = this.manifest() as Record<string, unknown>;
    return {
      snapshot_name: this.snapshotName,
      snapshot_id: manifest.snapshot_id ?? null,
      publication_status: manifest.publication_status ?? null,
      official: manifest.official ?? null,
      publishable: manifest.publishable ?? null,
      postgres_e2e_complete: manifest.postgres_e2e_complete ?? null,
      live_edgar_full_financial: manifest.live_edgar_full_financial ?? null,
      live_edgar_acceptance_set: manifest.live_edgar_acceptance_set ?? null,
      parent_snapshot_id: manifest.parent_snapshot_id ?? null,
      as_of: manifest.as_of ?? null,
      known_limitations: manifest.known_limitations ?? [],
      note: "Read-only API over frozen snapshot files. Not a live market data feed.",
    };
  }
}
