import { loadEnvConfig } from "./env.js";
import {
  checkDatabaseConnectivity,
  closePool,
  getPool,
} from "./client.js";
import { listMigrations, migrate, migrationStatus } from "./migration-runner.js";
import {
  createPostgresUnitOfWork,
} from "./postgres-unit-of-work.js";
import { createInMemoryUnitOfWork } from "./unit-of-work.js";
import type { PipelineUnitOfWork } from "./unit-of-work.js";

export type RepositoryMode = "postgres" | "memory";

export interface DatabaseEndpointInfo {
  host: string;
  port: string;
  database: string;
  user: string;
}

/** Parse DATABASE_URL without exposing the password. */
export function describeDatabaseUrl(databaseUrl: string): DatabaseEndpointInfo {
  const u = new URL(databaseUrl);
  return {
    host: u.hostname || "localhost",
    port: u.port || "5432",
    database: (u.pathname || "/").replace(/^\//, "") || "unknown",
    user: decodeURIComponent(u.username || "unknown"),
  };
}

export function parseRepositoryMode(
  value: string | undefined,
  fallback: RepositoryMode = "memory"
): RepositoryMode {
  if (!value) return fallback;
  if (value === "postgres" || value === "memory") return value;
  throw new Error(
    `Invalid --repository mode "${value}". Expected "postgres" or "memory".`
  );
}

export interface RepositoryBootstrap {
  mode: RepositoryMode;
  uow: PipelineUnitOfWork;
  processingRunId: string;
  database?: DatabaseEndpointInfo;
  migration: {
    applied: string[];
    pending: string[];
    newly_applied: string[];
  };
  release: () => Promise<void>;
  pg?: Awaited<ReturnType<typeof createPostgresUnitOfWork>>;
}

/**
 * Select repository backend. When mode=postgres, fail clearly if unavailable.
 * Never silently falls back to memory.
 */
export async function bootstrapRepository(input: {
  mode: RepositoryMode;
  processingRunId: string;
  pipelineName: string;
  log?: (msg: string) => void;
}): Promise<RepositoryBootstrap> {
  const log = input.log ?? ((msg: string) => console.error(msg));
  const env = loadEnvConfig();

  log(`[repository] mode=${input.mode}`);

  if (input.mode === "memory") {
    log("[repository] using in-memory unit of work");
    return {
      mode: "memory",
      uow: createInMemoryUnitOfWork(),
      processingRunId: input.processingRunId,
      migration: { applied: [], pending: listMigrations().map((m) => m.id), newly_applied: [] },
      release: async () => undefined,
    };
  }

  if (!env.databaseUrl) {
    throw new Error(
      "Repository mode is postgres but DATABASE_URL is not set. " +
        "Start Postgres (npm run db:up) and configure .env, or pass --repository memory."
    );
  }

  const endpoint = describeDatabaseUrl(env.databaseUrl);
  log(
    `[repository] postgres host=${endpoint.host} port=${endpoint.port} database=${endpoint.database} user=${endpoint.user}`
  );

  const reachable = await checkDatabaseConnectivity();
  if (!reachable) {
    throw new Error(
      `PostgreSQL is not reachable at ${endpoint.host}:${endpoint.port}/${endpoint.database}. ` +
        "Start Docker (`npm run db:up`) or fix DATABASE_URL. Refusing silent memory fallback."
    );
  }

  const migrateResult = await migrate();
  const status = await migrationStatus();
  log(
    `[repository] migrations applied=${status.applied.length} pending=${status.pending.length}` +
      (migrateResult.applied.length
        ? ` newly_applied=[${migrateResult.applied.join(",")}]`
        : "")
  );
  if (status.pending.length) {
    throw new Error(
      `PostgreSQL migrations pending after migrate(): ${status.pending.join(", ")}`
    );
  }

  const pg = await createPostgresUnitOfWork(
    getPool(),
    input.processingRunId
  );

  return {
    mode: "postgres",
    uow: pg.uow,
    processingRunId: input.processingRunId,
    database: endpoint,
    migration: {
      applied: status.applied,
      pending: status.pending,
      newly_applied: migrateResult.applied,
    },
    pg,
    release: async () => {
      pg.release();
      await closePool();
    },
  };
}
