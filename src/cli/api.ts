#!/usr/bin/env node
import { createReadOnlyApiServer } from "../api/read-only-server.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const snapshotName = argValue("--snapshot") ?? process.env.SNAPSHOT_NAME;
  const port = argValue("--port")
    ? Number(argValue("--port"))
    : undefined;
  const host = argValue("--host");

  const api = createReadOnlyApiServer({
    snapshotName,
    port,
    host,
  });

  await api.start();
  console.error(
    `[api] read-only snapshot API listening on http://${api.host}:${api.port}`
  );
  console.error(`[api] snapshot=${api.store.snapshotName}`);
  console.error(`[api] dir=${api.store.snapshotDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
