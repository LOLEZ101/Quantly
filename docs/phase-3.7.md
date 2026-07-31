# Phase 3.7 — PostgreSQL E2E + Live EDGAR Operational Acceptance

## Goal

Complete the two missing operational requirements without redesigning the architecture:

1. PostgreSQL end-to-end persistence (no silent memory fallback)
2. Live official SEC EDGAR verification for companyfacts/submissions

## Repository modes

```bash
--repository postgres   # required for official statuses; fails if DB unavailable
--repository memory     # explicit offline/dev only
```

Startup logs:

```text
[repository] mode=postgres
[repository] postgres host=localhost port=5432 database=peer_engine user=peer
[repository] migrations applied=3 pending=0
```

## Live EDGAR

```bash
# .env
SEC_CONTACT_EMAIL=you@example.com
SEC_USER_AGENT=PeerEngine/0.3.7 (research; you@example.com)

npm run phase3.7:operational   # postgres + live + acceptance set (5 companies)
npm run phase3.7:full          # postgres + live + all 30
```

Strict live mode (`--live-edgar`):

- Does **not** fall back to offline companyfacts/submissions
- Ignores cache entries whose `original_uri` is not `data.sec.gov`
- Requires `SEC_CONTACT_EMAIL`

Filing HTML may still use offline verified excerpts for section extraction; financial authority is live companyfacts.

## Publication statuses

| Status | Requirements |
|--------|----------------|
| `official_acceptance_set_verified` | Postgres E2E + live EDGAR core financials for VZ/MCD/NVDA/INTC/AMT |
| `official_full_pilot_verified` | Postgres E2E + live EDGAR for all 30 + publishable |
| `website_ready_not_official` | Contracts OK but operational requirements incomplete |
| `blocked` | Hard failure |

## Snapshot

`exports/snapshots/pilot-v5-operational` (parent `snap_pilot_v4_official`).

## Baseline

See `docs/phase-3.7-baseline.md` for skipped-test names and environmental blockers.
