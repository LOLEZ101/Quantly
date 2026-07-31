# Review Workflow

## When review items are created

- No confident primary path
- Ambiguous primary candidates
- Segment coverage below configured thresholds
- No close peers for key peer types
- Incomplete peer scores (too many missing components)
- Missing evidence on automated classifications
- Unusually diversified secondary exposures
- Eligibility conflicts on supposed direct competitors
- Highly inconsistent reciprocity on top peers
- Overrides that conflict with calculated primaries

## Review item fields

`review_item_id`, company or pair, `severity`, `reason_code`, description, evidence ids, suggested action, `created_date`, `status`.

Statuses: `pending` | `in_review` | `approved` | `rejected` | `cancelled`.

## Manual overrides

Overrides live in `data/pilot/manual-overrides.json` and remain separate from calculated outputs.

Supported actions:

- `force_primary_classification`
- `add_secondary_exposure` / `remove_secondary_exposure`
- `add_peer` / `remove_peer` / `adjust_peer_rank`
- `mark_relationship_reviewed`
- `resolve_review_item`

Each override stores rationale, reviewer, effective date, and optional expiration/review-by date. Calculated values are preserved in classification/peer metadata when replaced.

## Phase-3 review reasons

Additional reason codes include identifier conflicts, missing CIK, failed section extraction, XBRL conflicts/unmapped concepts, illustrative fallbacks, and material classification/peer changes after source ingestion. See `docs/phase-3-operations.md`.

1. Inspect evidence and score components in the snapshot.
2. Apply an override if the taxonomy/economics judgment differs from the model.
3. Use `resolve_review_item` to mark the queue entry approved.
4. Re-run `npm run phase2:pilot` and confirm the snapshot validation report is clean.
