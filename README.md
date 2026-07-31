# Quantly / Peer Engine

Company-classification and peer-comparison engine for Quantly.

Makes sophisticated financial statistics understandable: what a company does, where it fits, who its peers are, why, how strong the comparison is, and where the data came from.

## Status

| Phase | Outcome |
|-------|---------|
| 1–3.6 | Complete (see `docs/`) |
| 3.7 | Full pilot live-EDGAR 30/30 + Postgres verified (`official_full_pilot_verified`) |
| 4 | Read-only snapshot API (`npm run api:readonly`) |
| 5+ | Website / S&P expansion — see [`docs/master-roadmap.md`](docs/master-roadmap.md) |

Recovery notes after Phase 3.7 crash: [`docs/phase-3.7-recovery-audit.md`](docs/phase-3.7-recovery-audit.md).

## Quick start (offline)

```bash
npm install
npm test
npm run phase2:pilot
npm run api:readonly
# http://127.0.0.1:8787/health
# http://127.0.0.1:8787/v1/companies/VZ
```

## Important commands

| Command | Purpose |
|---------|---------|
| `npm test` | Full offline suite |
| `npm run phase3.7:memory` | Phase 3.7 offline memory path |
| `npm run phase3.7:operational` | Postgres + live EDGAR acceptance set |
| `npm run phase3.7:full` | Postgres + live EDGAR all 30 (long) |
| `npm run api:readonly` | Phase-4 read-only snapshot API |
| `npm run db:up` / `db:migrate` | Local Postgres |

## Snapshots (do not delete)

```text
exports/snapshots/pilot-v1/
exports/snapshots/pilot-v2-sourced/
exports/snapshots/pilot-v3-verified/
exports/snapshots/pilot-v4-official/
exports/snapshots/pilot-v5-operational/   ← default API snapshot
```

## Documentation

- [Master roadmap](docs/master-roadmap.md)
- [Architecture](docs/architecture.md)
- [Phase 3.7 recovery audit](docs/phase-3.7-recovery-audit.md)
- [Phase 4 API](docs/phase-4-api.md)
- [Database runtime](docs/database-runtime.md)

## Non-goals (current)

No investment recommendations, unsupervised LLM classification, embeddings, or forced “full official” status without live EDGAR 30/30.
