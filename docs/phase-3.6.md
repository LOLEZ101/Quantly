# Phase 3.6 — Official-source, Persistence, and Website-readiness Acceptance

## Objective

Answer four questions conclusively and emit `pilot-v4-official` with an honest publication status.

| # | Question | Artifact |
|---|----------|----------|
| 1 | Where did every field in `independent-corpus.ts` come from? | `src/verified/corpus-field-provenance.ts`, `corpus-field-provenance.json` |
| 2 | Which fields are supported by authoritative SEC records? | `official-source-support.json` |
| 3 | Can the verified pipeline run through PostgreSQL end-to-end? | migration `003`, `postgres-unit-of-work.ts`, persistence summary |
| 4 | Are snapshot contracts stable for a read-only API/website phase? | `website-readiness-report.json` |

## Answers (offline default)

1. **Origin:** Every corpus numeric/disclosure field is a **hand-authored offline approximation** (or public identifier convention for ticker/CIK/registrant). Not generated from Phase-2 curated JSON. Not live EDGAR by default.
2. **SEC support:** Financial scalars are **concept-mappable** to us-gaap companyfacts (`Revenues`, `OperatingIncomeLoss`, `Assets`, …). Segment %, franchise %, and model labels require **filing-text extraction**. Identifier fields are confirmable via SEC submissions. Default offline fixtures do **not** count as authoritative live EDGAR.
3. **Postgres:** When `DATABASE_URL` is reachable, Phase 3.6 migrates through `003_phase36_pipeline_persistence` and persists companies, source payloads, facts, sections, evidence, classifications, peers, and review items. Without Postgres, the run completes in memory and `postgres_e2e_complete=false`.
4. **Website readiness:** Frozen contracts under `contracts/` plus required snapshot artifacts are checked. Passing readiness does **not** imply official SEC verification.

## Publication statuses

| Status | Meaning |
|--------|---------|
| `blocked` | Hard gate failure |
| `acceptance_incomplete` | Pipeline ran but readiness/Postgres incomplete |
| `website_ready_not_official` | Contracts/artifacts stable for a future read-only API; **not** official |
| `official` | Live EDGAR full financials for all companies **and** Postgres E2E **and** website readiness |

`publishable` / `official` remain `false` unless status is `official`.

## Commands

```bash
npm run fixtures:verified
npm run phase3.6:acceptance          # offline; uses Postgres if DATABASE_URL up
npm run phase3.6:acceptance -- --memory
npm run db:up && npm run db:migrate
RUN_DB_TESTS=true npm run test:db
```

## Snapshot

`exports/snapshots/pilot-v4-official` (`snap_pilot_v4_official`), parent `snap_pilot_v3_verified`.

Does not overwrite `pilot-v1`, `pilot-v2-sourced`, or `pilot-v3-verified`.
