# Pilot Data Guide

## Purpose

Phase-2 pilot fixtures are manually curated, hand-reviewed inputs used to prove taxonomy, classification, eligibility, scoring, review, and snapshot export — without SEC scraping, AI extraction, or live market APIs.

## Location

```text
data/pilot/
  companies.json
  business-segments.json
  company-exposures.json
  customer-exposures.json
  geographic-exposures.json
  operating-models.json
  evidence.json
  financial-features.json
  manual-overrides.json
config/pilot-universe.yaml
```

Regenerate from the authoring script:

```bash
npm run fixtures:generate
```

## Quality labels

Every substantive field must declare one of:

| Label | Meaning |
|-------|---------|
| `reported` | Taken from a disclosed figure (or faithful restatement) |
| `derived` | Calculated from reported inputs (e.g., franchise location %) |
| `manually_classified` | Human judgment / pilot classification |
| `illustrative` | Representative test value — **not live financial data** |

Financial bands in `financial-features.json` are illustrative by design. Exact market caps and TTM revenue are intentionally omitted.

## Phase 3 note

Curated Phase-2 fixtures in `data/pilot/` are retained. Phase 3 reconciles them against SEC-backed sources and writes provenance to `reports/phase3/` and `exports/snapshots/pilot-v2-sourced/`. Illustrative values may remain only when disclosed.

1. Add the company key to `config/pilot-universe.yaml` and the generator in `scripts/generate-pilot-fixtures.ts` (or edit JSON directly).
2. Provide segments with `node_id` mappings into the current taxonomy.
3. Provide customer, geographic, operating-model, evidence, and financial-band rows.
4. Label every field’s quality and `as_of` date.
5. Set `sp500_membership_status` explicitly (`member` | `not_member` | `unknown`).
6. Run `npm run validate` then `npm run phase2:pilot`.

## Classification inputs

Primary path selection uses:

1. Segment revenue weights (and operating-income weights on ties)
2. Franchise location mix thresholds for restaurant leaves
3. Manual overrides when present
4. Evidence for confidence / audit

See `docs/phase-2-decisions.md` and `config/classification-thresholds.yaml`.

## Incomplete disclosures

`company-exposures.json` stores `coverage_ratio` and `unallocated_weight`. Do not fabricate missing segment weights. Low coverage lowers confidence and creates review items.
