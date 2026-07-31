# Snapshot Format

## Output layout

```text
exports/snapshots/pilot-v1/
  manifest.json
  taxonomy.json
  tree.json
  companies.json
  company/{TICKER}.json
  peers/{TICKER}.json
  review-queue.json
  validation-report.json
```

## Manifest

Conforms to `contracts/snapshot-manifest.schema.json` (plus internal extension fields for fixture version, validation status, and known limitations).

Includes:

- Snapshot ID / type
- Creation and as-of dates (fixed in pilot for determinism)
- Taxonomy, peer-model, adjacency, and fixture versions
- Counts and artifact hashes
- Validation status and known limitations

## Company files

Each `company/{TICKER}.json` contains a contract-compatible classification payload plus a `_pilot` extension block with selection reason, confidence components, and coverage metadata.

## Peer files

Each `peers/{TICKER}.json` bundles peer groups by peer type. Contract validation strips explanation/eligibility extensions when checking `peer-response.schema.json`.

## Phase-3 sourced snapshot

`exports/snapshots/pilot-v2-sourced/` extends the Phase-2 layout with:

- `evidence/`, `sources/`
- `source-coverage.json`, `provenance-report.json`, `reconciliation-report.json`
- `classification-impact.json`, `peer-impact.json`, `illustrative-fallbacks.json`

Parent snapshot remains `pilot-v1` / `snap_pilot_v1`. Phase 3 never overwrites Phase-2 history.

## Phase-3.6 official acceptance snapshot

`exports/snapshots/pilot-v4-official/` adds:

- `corpus-field-provenance.json`
- `official-source-support.json`
- `website-readiness-report.json`
- `persistence-summary.json`
- `gated-peer-types.json`

Manifest extension fields include `publication_status`, `publishable`, `official`, `postgres_e2e_complete`, and `live_edgar_full_financial`. Offline default status is `website_ready_not_official` (not official/published).
