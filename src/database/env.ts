import { config as loadEnv } from "dotenv";
import { repoPath } from "../config/paths.js";

loadEnv({ path: repoPath(".env") });

export interface AppEnv {
  databaseUrl: string | null;
  secUserAgent: string;
  secContactEmail: string;
  rawDataDir: string;
  snapshotOutputDir: string;
  ingestionConcurrency: number;
  ingestionDelayMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  runLiveSecTests: boolean;
  runDbTests: boolean;
}

export function loadEnvConfig(): AppEnv {
  return {
    databaseUrl: process.env.DATABASE_URL ?? null,
    secUserAgent:
      process.env.SEC_USER_AGENT ??
      "PeerEngine/0.3 (offline-dev; set SEC_USER_AGENT for live requests)",
    secContactEmail: process.env.SEC_CONTACT_EMAIL ?? "",
    rawDataDir: process.env.RAW_DATA_DIR ?? "data/raw",
    snapshotOutputDir: process.env.SNAPSHOT_OUTPUT_DIR ?? "exports/snapshots",
    ingestionConcurrency: Number(process.env.INGESTION_CONCURRENCY ?? 2),
    ingestionDelayMs: Number(process.env.INGESTION_DELAY_MS ?? 200),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
    maxRetries: Number(process.env.MAX_RETRIES ?? 3),
    runLiveSecTests: process.env.RUN_LIVE_SEC_TESTS === "true",
    runDbTests: process.env.RUN_DB_TESTS === "true",
  };
}
