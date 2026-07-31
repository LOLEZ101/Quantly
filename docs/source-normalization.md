# Source Normalization

## XBRL concept map

Versioned in `src/normalization/xbrl-concept-map.ts`.

Unmapped concepts are retained with `data_quality_status=unmapped` and can create review items.

## Canonical fact selection

`select-canonical-fact.ts` prefers:

1. Annual forms over quarterly
2. Non-amendments when ranks tie
3. Later filing date
4. Stable concept name

It never chooses the largest numeric value alone. All facts are retained; conflicts are recorded.

## Filing sections

Heuristic heading/anchor extraction only (no LLM). Unresolved sections are marked and queued for review.
