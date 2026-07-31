# Phase 3.7 Baseline

Recorded before operational acceptance changes.

## Test suite (Phase 3.6 exit)

| Result | Count |
|--------|------:|
| Passed | 81 |
| Skipped | 2 |
| Failed | 0 |

## Skipped tests (exact)

### 1. Optional PostgreSQL integration → `applies migrations including Phase-3.6 and persists a pipeline run`

- **File:** `tests/phase3/database.integration.test.ts`
- **Suite:** `Optional PostgreSQL integration`
- **Skip condition:** `describe.skipIf(!enabled)` where `enabled = process.env.RUN_DB_TESTS === "true"`
- **Default:** skipped (`RUN_DB_TESTS=false`)

### 2. Optional live SEC tests → `requires SEC contact configuration`

- **File:** `tests/phase3/live-sec.test.ts`
- **Suite:** `Optional live SEC tests`
- **Skip condition:** `describe.skipIf(!enabled)` where `enabled = process.env.RUN_LIVE_SEC_TESTS === "true"`
- **Default:** skipped (`RUN_LIVE_SEC_TESTS=false`)
- **Also requires:** `SEC_CONTACT_EMAIL` (and polite `SEC_USER_AGENT`) for real EDGAR HTTP requests

## Snapshot status

| Snapshot | Status |
|----------|--------|
| `pilot-v4-official` | `website_ready_not_official` |
| `official` / `publishable` | `false` |
| `live_edgar_full_financial` | `0/30` |
| `postgres_e2e_complete` | `false` (memory path) |

## PostgreSQL status

- Migrations present: `001`, `002`, `003_phase36_pipeline_persistence`
- Unit of work + repositories implemented
- Docker Compose service: `postgres:16-alpine` → `peer_engine` / user `peer`
- **Blocker at baseline:** Docker daemon unavailable → migrate/E2E not exercised
- Phase 3.6 silently fell back to memory when Postgres was unreachable (`preferPostgres`)

## Live EDGAR coverage

- Adapter: `src/sources/sec/live-adapter.ts`
- Throttle / retries via `INGESTION_DELAY_MS`, `MAX_RETRIES`, `REQUEST_TIMEOUT_MS`
- User-Agent requires `SEC_CONTACT_EMAIL`
- **Blocker at baseline:** live path not run; adapter may fall back to offline fixtures on fetch failure
- Independent corpus remains hand-authored offline approximations

## Environmental requirements for Phase 3.7

```bash
# PostgreSQL
docker compose up -d postgres   # or equivalent DATABASE_URL
DATABASE_URL=postgres://peer:peer@localhost:5432/peer_engine
npm run db:migrate

# Live SEC (SEC fair-access: identify a contact email)
SEC_CONTACT_EMAIL=you@example.com
SEC_USER_AGENT=PeerEngine/0.3.7 (research; you@example.com)

# Optional gated tests
RUN_DB_TESTS=true
RUN_LIVE_SEC_TESTS=true
```

## Target statuses (do not force)

| Status | Meaning |
|--------|---------|
| `official_acceptance_set_verified` | Postgres E2E + live EDGAR for demo acceptance set (VZ, MCD, NVDA, INTC, AMT) |
| `official_full_pilot_verified` | Postgres E2E + live EDGAR for all 30 pilot companies |
| remain `website_ready_not_official` / `blocked` | If either operational requirement fails |

## As of recovery (post-crash)

See also [`phase-3.7-recovery-audit.md`](phase-3.7-recovery-audit.md). This section does **not** erase the pre-change baseline above.

| Item | Recovery-time discovery | After reconfirm |
|------|-------------------------|-----------------|
| `pilot-v5-operational` | Found overwritten as memory/`website_ready_not_official` | Restored to `official_acceptance_set_verified` |
| Postgres E2E | Not present on disk artifact | `postgres_e2e_complete=true` |
| Live EDGAR | 0 on disk artifact; prior full run interrupted | Acceptance set 5/5; full attempt 29/30 (GFS partial) — not full-pilot official |
| Silent memory fallback | Removed for Phase 3.7 via `--repository postgres\|memory` | Unchanged |
| Full-pilot status | **Not** `official_full_pilot_verified` | Still not forced |
| Snapshots v1–v5 | All preserved on disk | Preserved |
| Raw cache | ~85MB `data/raw/` retained (gitignored) | Retained |
