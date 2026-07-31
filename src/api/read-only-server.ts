import http from "node:http";
import { URL } from "node:url";
import { SnapshotStore } from "./snapshot-store.js";

export interface ApiServerOptions {
  host?: string;
  port?: number;
  snapshotName?: string;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "X-Quantly-Api": "snapshot-readonly/1.0",
  });
  res.end(payload + "\n");
}

function sendError(
  res: http.ServerResponse,
  status: number,
  message: string
): void {
  sendJson(res, status, {
    error: message,
    status,
  });
}

/**
 * Phase-4 read-only HTTP API over frozen snapshot exports.
 * Does not mutate data, ingest SEC, or serve recommendations.
 */
export function createReadOnlyApiServer(options: ApiServerOptions = {}) {
  const store = new SnapshotStore(options.snapshotName);
  const host = options.host ?? process.env.API_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.API_PORT ?? 8787);

  const server = http.createServer((req, res) => {
    try {
      if (!req.url || !req.method) {
        sendError(res, 400, "Bad request");
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendError(res, 405, "Method not allowed — read-only API");
        return;
      }

      const url = new URL(req.url, `http://${host}:${port}`);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/health") {
        sendJson(res, 200, {
          ok: true,
          service: "quantly-snapshot-api",
          mode: "read-only",
          snapshot: store.snapshotName,
        });
        return;
      }

      if (path === "/v1/meta/publication" || path === "/v1/meta") {
        sendJson(res, 200, store.publicationMeta());
        return;
      }

      if (path === "/v1/snapshot" || path === "/v1/manifest") {
        sendJson(res, 200, store.manifest());
        return;
      }

      if (path === "/v1/taxonomy") {
        sendJson(res, 200, store.taxonomy());
        return;
      }

      if (path === "/v1/taxonomy/tree") {
        sendJson(res, 200, store.tree());
        return;
      }

      if (path === "/v1/companies") {
        sendJson(res, 200, {
          ...((store.companiesIndex() as object) ?? {}),
          tickers: store.listCompanyTickers(),
        });
        return;
      }

      const companyMatch = path.match(/^\/v1\/companies\/([A-Za-z0-9.-]+)$/);
      if (companyMatch) {
        sendJson(res, 200, store.company(companyMatch[1]));
        return;
      }

      const peersMatch = path.match(
        /^\/v1\/companies\/([A-Za-z0-9.-]+)\/peers$/
      );
      if (peersMatch) {
        sendJson(res, 200, store.peers(peersMatch[1]));
        return;
      }

      const sourcesMatch = path.match(
        /^\/v1\/companies\/([A-Za-z0-9.-]+)\/sources$/
      );
      if (sourcesMatch) {
        const body = store.sources(sourcesMatch[1]);
        if (!body) {
          sendError(res, 404, `Sources not found for ${sourcesMatch[1]}`);
          return;
        }
        sendJson(res, 200, body);
        return;
      }

      const evidenceMatch = path.match(
        /^\/v1\/companies\/([A-Za-z0-9.-]+)\/evidence$/
      );
      if (evidenceMatch) {
        const body = store.evidence(evidenceMatch[1]);
        if (!body) {
          sendError(res, 404, `Evidence not found for ${evidenceMatch[1]}`);
          return;
        }
        sendJson(res, 200, body);
        return;
      }

      if (path === "/v1/artifacts/peer-types") {
        const body =
          store.optionalArtifact("gated-peer-types.json") ??
          {
            note: "gated-peer-types.json not present in this snapshot",
          };
        sendJson(res, 200, body);
        return;
      }

      if (path === "/v1/artifacts/website-readiness") {
        const body = store.optionalArtifact("website-readiness-report.json");
        if (!body) {
          sendError(res, 404, "website-readiness-report.json not in snapshot");
          return;
        }
        sendJson(res, 200, body);
        return;
      }

      if (path === "/" || path === "/v1") {
        sendJson(res, 200, {
          service: "quantly-snapshot-api",
          mode: "read-only",
          snapshot: store.snapshotName,
          endpoints: [
            "GET /health",
            "GET /v1/meta/publication",
            "GET /v1/snapshot",
            "GET /v1/taxonomy",
            "GET /v1/taxonomy/tree",
            "GET /v1/companies",
            "GET /v1/companies/:ticker",
            "GET /v1/companies/:ticker/peers",
            "GET /v1/companies/:ticker/sources",
            "GET /v1/companies/:ticker/evidence",
            "GET /v1/artifacts/peer-types",
            "GET /v1/artifacts/website-readiness",
          ],
        });
        return;
      }

      sendError(res, 404, `Not found: ${path}`);
    } catch (err) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode: number }).statusCode)
          : 500;
      sendError(
        res,
        status || 500,
        err instanceof Error ? err.message : String(err)
      );
    }
  });

  return {
    store,
    host,
    port,
    server,
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
