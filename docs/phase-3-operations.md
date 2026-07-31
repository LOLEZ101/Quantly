# Phase 3 Operations

## Full offline pipeline

```bash
npm run fixtures:sec
npm run phase3:pilot
```

## One company

```bash
npm run ingest:company -- --ticker VZ
npm run reconcile:company -- --ticker MCD
npm run classify:company -- --ticker NVDA
```

## Partial failure

A failed company is recorded in the run summary and does not erase successful company caches. Snapshot publication is blocked only when critical identifier/source/contract errors remain.

## Resume / rerun

Raw cache checksums prevent duplicate downloads/writes. Re-running offline Phase 3 is idempotent and deterministic.
