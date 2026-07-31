# Phase 3 Changelog

## 2026-07-31 — Phase 3 source ingestion

### Additive schema extensions

- Added migration `002_phase3_source_layer.sql` for:
  - `source_payloads` (immutable raw payload metadata)
  - `financial_facts` + `financial_fact_conflicts`
  - `filing_sections`
  - `evidence_candidates`
  - `identifier_resolutions`
  - Extended `processing_runs` metadata columns
- Preserved Phase-1 `database/schema.sql` as migration `001_baseline_schema.sql`.

### Contract changes

- No breaking contract changes.
- Source-backed snapshot adds provenance reports alongside existing contract payloads.
- Peer-response and classification contracts remain valid for published company/peer JSON.

### Compatibility

- Phase-2 curated fixtures retained under `data/pilot/`.
- Snapshot `pilot-v1` is never overwritten; Phase 3 publishes `pilot-v2-sourced`.
