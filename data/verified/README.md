# Verified offline SEC corpus

- `provenance_class`: `independent_offline_verified_excerpt`
- `verified_corpus_version`: `1.0.0`
- Source of truth: `src/verified/independent-corpus.ts`
- Generator: `scripts/generate-verified-sec-fixtures.ts`

These fixtures are **not** generated from Phase-2 `data/pilot/business-segments.json` or `operating-models.json`.
They are still compact offline stand-ins (not full EDGAR archives), but they break circular verification.

Deprecated circular fixtures remain at `data/fixtures/sec/` for historical Phase-3 regression only.
