# Reconciliation

Compares Phase-2 curated fixtures with source-backed values.

Statuses:

- confirmed_by_source
- source_supported_minor_difference
- material_conflict
- not_found_in_source
- source_contains_greater_detail
- curated_illustrative
- human_interpretation_required

Reports land in `reports/phase3/` and inside `exports/snapshots/pilot-v2-sourced/`.

Precedence for published fields:

1. Human-reviewed source-backed
2. Structured facts
3. Filing disclosures
4. Derived source-backed values
5. Curated values
6. Illustrative test values (disclosed)
