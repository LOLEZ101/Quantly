import pg from "pg";
import { loadEnvConfig } from "./env.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const env = loadEnvConfig();
  if (!env.databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Start Postgres (npm run db:up) or use --offline in-memory mode."
    );
  }
  pool = new Pool({
    connectionString: env.databaseUrl,
    keepAlive: true,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 15_000,
    max: 4,
  });
  // Idle clients can emit errors after a Postgres restart; avoid crashing the process.
  pool.on("error", (err) => {
    console.error(`[pg] idle client error: ${err.message}`);
  });
  return pool;
}

export async function withClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnectivity(): Promise<boolean> {
  try {
    const result = await getPool().query("select 1 as ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
