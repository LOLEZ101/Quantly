# Database Runtime

## Local Postgres

```bash
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:status
```

Default URL: `postgres://peer:peer@localhost:5432/peer_engine`

Without Docker, install PostgreSQL locally and set `DATABASE_URL`.

## Repositories

Production code uses `pg` via `src/database/client.ts` and `transaction.ts`.

Phase 3.6 adds `createPostgresUnitOfWork` (`src/database/postgres-unit-of-work.ts`) which persists:

- companies / source_payloads / financial_facts (relational)
- filing sections, evidence, identifiers, classifications, peers, review items via `pipeline_stage_payloads`
- website readiness checks via `website_readiness_checks`

`npm run phase3.6:acceptance` prefers Postgres when `DATABASE_URL` is reachable; use `--memory` to force in-memory.

Without Docker, install PostgreSQL locally and set `DATABASE_URL`.

## Migrations

```text
database/migrations/001_baseline_schema.sql
database/migrations/002_phase3_source_layer.sql
database/migrations/003_phase36_pipeline_persistence.sql
```

Applied through `schema_migrations`. Phase-3/3.6 tables are additive.

## Offline / tests

`npm test` does not require Postgres. Optional:

```bash
RUN_DB_TESTS=true npm run test:db
```
