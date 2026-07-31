# Phase 3.7 Recovery Audit

Recorded after the development session crash during Phase 3.7 full-pilot execution, then updated during post-recovery reconfirm.

**Safety:** No destructive Git operations were used. No snapshots or `data/raw/` were deleted. Regenerable `financial_facts` rows were truncated once (with approval) after a Postgres abort during duplicate-heavy inserts.

## Snapshot inventory (preserved)

| Snapshot directory | Snapshot ID | Publication status | Notes |
|--------------------|-------------|-------------------|--------|
| `pilot-v1` | `snap_pilot_v1` | (Phase-2 style; no `publication_status` field) | Preserved |
| `pilot-v2-sourced` | `snap_pilot_v2_sourced` | `published` | Historical overstatement; retained as artifact |
| `pilot-v3-verified` | `snap_pilot_v3_verified` | `verified_offline_independent` | Preserved |
| `pilot-v4-official` | `snap_pilot_v4_official` | `website_ready_not_official` | `official=false`, live 0/30 |
| `pilot-v5-operational` | `snap_pilot_v5_operational` | **`official_acceptance_set_verified`** (reconfirmed) | See reconfirm section |

## Recovery-time discrepancy (corrected)

At first inventory after the crash, docs assumed `pilot-v5-operational` still held an acceptance-set official result. On-disk inspection found it had been overwritten by a later **memory/offline** run:

| Field | Found on disk at recovery | After reconfirm |
|-------|---------------------------|-----------------|
| `repository_mode` | `memory` | `postgres` |
| `postgres_e2e_complete` | `false` | `true` |
| `live_edgar_acceptance_set` | `0` | `5` |
| `live_edgar_full_financial` | `0` | `5` (acceptance-set run) |
| `publication_status` | `website_ready_not_official` | `official_acceptance_set_verified` |

Interrupted full-pilot evidence: `/tmp/phase37-full.log` from the crash window only showed startup lines.

## Phase 3.7 operational outcome (post-reconfirm)

| Requirement | Status |
|-------------|--------|
| PostgreSQL E2E (acceptance-set run) | **Completed** (`repository_mode=postgres`, host `localhost`, db `peer_engine`) |
| Live EDGAR acceptance set (VZ, MCD, NVDA, INTC, AMT) | **Completed** (`live_edgar_acceptance_set=5`) |
| Live EDGAR full pilot (30/30) | **Attempted** (`/tmp/phase37-full.log`): reached **29/30** live core financials; **GFS** remained `partial` (missing mapped core metrics). Run also blocked on illustrative peer bands + incomplete persistence for the full universe |
| `official_full_pilot_verified` | **Not claimed** (honest) |
| Snapshot after full attempt | Briefly became `blocked`; **restored** via re-run of `phase3.7:operational` to `official_acceptance_set_verified` |

Reconfirm command and log:

```bash
npm run phase3.7:operational   # --repository postgres --live-edgar --acceptance-set
# log: /tmp/phase37-operational-reconfirm.log
```

Result excerpt: `publication_status=official_acceptance_set_verified`, `postgres_e2e_complete=true`, `retrieval_failures=[]`.

## Stability fixes applied during reconfirm

Without redesigning Phases 1–3.6:

1. `financial_facts` inserts use `ON CONFLICT DO NOTHING` (avoid exception storms on re-runs).
2. Pipeline persistence stores **mapped** facts only (`normalized_metric` set); raw companyfacts remain in `data/raw/`.
3. Postgres pool keep-alive + idle client error handlers (long live-EDGAR waits).
4. Phase-3.7 memory offline test uses `skipSnapshot: true` so `npm test` does not clobber `pilot-v5-operational`.

Prior failure mode: inserting tens of thousands of unmapped XBRL rows per company crashed Node (exit 139) / stressed Postgres (autovacuum abort).

## Git inventory (non-destructive)

Branch: `main` (tracks `origin/main`)

**Modified tracked files (typical):** `.gitignore`, `README.md`, `package.json`, `package-lock.json`

**Untracked Peer Engine work (do not discard):** `config/`, `contracts/`, `data/` (fixtures/verified/pilot; raw gitignored), `database/`, `docker-compose.yml`, `.env.example`, `docs/`, `exports/`, `reports/`, `scripts/`, `src/**`, `tests/`, `tsconfig.json`, `vitest.config.js`

**Must not commit:** `.env`, credentials, `data/raw/` (~85MB — keep on disk)

## Phase 3.7 code present

- `src/pipeline/run-phase3.7.ts`
- `src/database/repository-mode.ts` (no silent memory fallback when `--repository postgres`)
- `src/sources/sec/live-adapter.ts` (strict live mode options)
- `docs/phase-3.7.md`, `docs/phase-3.7-baseline.md`
- `tests/phase3.7/operational.test.ts`
- Reports under `reports/phase3.7/`

## Environment

| Item | State |
|------|--------|
| Docker / Postgres | Started for reconfirm (`npm run db:up`); migrations 001–003 applied |
| `.env` | Present locally (not for commit) |
| Live SEC | `SEC_CONTACT_EMAIL` / `SEC_USER_AGENT` configured |

## Explicit non-claims

- Full pilot is **not** live-EDGAR verified until `live_edgar_full_financial === 30`.
- Filing HTML section extraction may still use offline verified excerpts.
- `valuation` / `market_behavior` peer types remain gated.
- Commit of Peer Engine work only when explicitly requested.

## Recommended next steps

1. ~~Non-destructive `npm test` (88 passed / 2 skipped; gated DB + live SEC also exercised).~~
2. ~~Reconfirm Postgres + acceptance-set live EDGAR.~~
3. ~~Document full-pilot attempt (29/30; not official).~~
4. ~~`docs/master-roadmap.md`.~~
5. ~~Phase 4 read-only snapshot API (`npm run api:readonly`).~~
6. Commit Peer Engine work only when explicitly requested (exclude secrets/raw cache).
