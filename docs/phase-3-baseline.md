# Phase 3 Baseline

Recorded before Phase-3 implementation began.

## Verification commands

```bash
npm install
npm test
npm run phase2:pilot
```

## Results

| Check | Result |
|-------|--------|
| Original test count | 60 |
| Tests passing | 60 / 60 |
| Phase-2 snapshot | `exports/snapshots/pilot-v1` |
| Snapshot publishable | yes (`errorCount: 0`) |
| Pilot companies | 30 |
| Peer types | `direct_competitor`, `operating`, `valuation`, `growth`, `risk`, `market_behavior` (+ Phase-1 aliases) |

After Phase-3 implementation, the suite is **70 passed / 2 skipped** (optional live SEC + optional Postgres), with original 60 preserved.

## Architecture observations preserved for Phase 3

1. Taxonomy remains a strict tree in `config/taxonomy.yaml`.
2. Company membership is many-to-many via exposures/segments.
3. PostgreSQL `database/schema.sql` is the intended production store but was design-only before Phase 3.
4. Deterministic classifier and peer engine consume in-memory domain objects from curated fixtures.
5. Many Phase-2 fields are labeled `illustrative` / `manually_classified` and are not live SEC-backed.
6. Contracts in `contracts/` remain consumer-facing and must not be casually broken.
7. Manual overrides stay separate from calculated outputs.
8. Historical records are append-only with effective dating.
9. Normal tests must remain offline after Phase 3.
10. Phase-2 snapshot `pilot-v1` must not be overwritten by Phase-3 sourced exports.

## Explicit non-goals carried into Phase 3

- Public website / React / public API
- Full S&P 500 taxonomy or classification
- LLM / embeddings / vector search
- Live stock-price features
- Investment recommendations
