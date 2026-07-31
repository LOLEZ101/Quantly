# Phase 3.5 Provenance Audit

## Finding: circular offline fixtures

`scripts/generate-sec-fixtures.ts` built `data/fixtures/sec/**` by reading:

- `data/pilot/companies.json`
- `data/pilot/business-segments.json`
- `data/pilot/operating-models.json`

Those Phase-2 curated values were embedded into supposed “SEC” business sections and segment percentages. Evidence extraction then “confirmed” the same curated facts.

**Conclusion:** Phase-3 offline evidence was not independently source-backed. Reconciliation that treated fixture text as confirming Phase-2 values was circular.

## Publication defect

`pilot-v2-sourced` was marked `publication_status: published` while reporting:

- 153 illustrative fallbacks
- illustrative peer feature bands still influencing scores
- fixture payloads that were Phase-2-derived

That status overstated verification strength.

## Remediation (Phase 3.5)

1. Freeze/deprecate circular fixture generation.
2. Introduce an **independent verified corpus** under `data/verified/` that does **not** import Phase-2 segment/operating JSON.
3. Label every offline payload with `provenance_class`.
4. Derive peer financial bands from XBRL facts when possible; exclude illustrative bands from scoring.
5. Gate `valuation` and `market_behavior` peer types without market/pricing data.
6. Persist pipeline outputs through a complete repository unit-of-work (Postgres when available; deterministic in-memory otherwise).
7. Publish `pilot-v3-verified` only under hardened rules; leave `pilot-v1` and `pilot-v2-sourced` untouched as historical artifacts.
