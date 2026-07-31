# Phase 4 — Read-only Snapshot API

Serves frozen Peer Engine snapshot exports for website integration.

## Non-goals

- No writes, ingestion, or classification
- No LLM, embeddings, live prices, or recommendations
- No full S&P 500 expansion

## Start

```bash
npm run api:readonly
# optional:
npm run api:readonly -- --snapshot pilot-v5-operational --port 8787
```

Environment:

- `SNAPSHOT_NAME` (default `pilot-v5-operational`)
- `API_HOST` (default `127.0.0.1`)
- `API_PORT` (default `8787`)

## Endpoints

| Method | Path | Source file |
|--------|------|-------------|
| GET | `/health` | — |
| GET | `/v1/meta/publication` | `manifest.json` fields |
| GET | `/v1/snapshot` | `manifest.json` |
| GET | `/v1/taxonomy` | `taxonomy.json` |
| GET | `/v1/taxonomy/tree` | `tree.json` |
| GET | `/v1/companies` | `companies.json` + ticker list |
| GET | `/v1/companies/:ticker` | `company/{TICKER}.json` |
| GET | `/v1/companies/:ticker/peers` | `peers/{TICKER}.json` |
| GET | `/v1/companies/:ticker/sources` | `sources/{TICKER}.json` |
| GET | `/v1/companies/:ticker/evidence` | `evidence/{TICKER}.json` |
| GET | `/v1/artifacts/peer-types` | `gated-peer-types.json` |
| GET | `/v1/artifacts/website-readiness` | `website-readiness-report.json` |

## Contracts

Prefer existing schemas under `contracts/` for payload shapes. The API returns the frozen snapshot JSON as exported; website clients should treat `publication_status`, `known_limitations`, and provenance fields as authoritative honesty signals.

## Default snapshot

`pilot-v5-operational` (`official_acceptance_set_verified` after post-recovery reconfirm). Full-pilot official status is not claimed (full live run reached 29/30; GFS partial).
