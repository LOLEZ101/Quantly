# Peer Engine Architecture

## Purpose

Peer Engine classifies companies into an economically meaningful hierarchical taxonomy and produces typed, explainable peer groups. Phase 1 defined contracts and storage shape. Phase 2 proves the design with a deterministic pilot over curated fixtures.

## Design principles

1. **Taxonomy is a tree; membership is many-to-many.**
2. **Primary path is privileged, not exclusive** (one per taxonomy version).
3. **Evidence is mandatory unless explicitly manual.**
4. **History is append-only** (effective dating; no overwrite of closed rows).
5. **Peer groups are typed, eligibility-filtered, and scored with inspectable components.**
6. **Contracts precede UI.** Website consumers bind to `contracts/*.schema.json`.
7. **Uncertainty is visible** via coverage ratios, incomplete scores, and review items.

## System context (Phase 3)

```text
SEC EDGAR (live, optional) ──┐
Offline SEC fixtures ────────┤
                             ▼
                     Raw immutable cache
                             ▼
              Normalize XBRL + filing sections
                             ▼
                   Evidence candidates
                             ▼
              Reconcile vs Phase-2 curated fixtures
                             ▼
                 Source-backed company profiles
                             ▼
        Existing deterministic classifier + peer engine
                             ▼
              exports/snapshots/pilot-v2-sourced
```

PostgreSQL migrations are executable via Docker Compose. Offline Phase-3 runs do not require a live database.

## Logical components

| Component | Responsibility |
|-----------|----------------|
| Taxonomy config | Authoritative tree |
| Classification thresholds | Franchise, coverage, materiality, confidence |
| Peer weights | Factor weights by peer type |
| Peer eligibility | Hard exclusions / penalties before scoring |
| Adjacent categories | Soft candidate generation links |
| Classifier | Deterministic primary/secondary assignment |
| Peer engine | Candidates → eligibility → score → rank → explain |
| Review + overrides | Human audit loop |
| Snapshot exporter | Versioned JSON publish gate |

## Classification flow

1. Aggregate curated segment weights by taxonomy node.
2. Select primary via revenue → operating income → … → review cascade.
3. Refine restaurant leaves using configurable franchise location thresholds.
4. Assign secondaries when materiality rules are met.
5. Compute confidence components (coverage, evidence, agreement, recency, ambiguity).
6. Apply manual overrides without destroying calculated outputs.

## Peer flow

1. Generate candidates with reasons (never silent Cartesian matching).
2. Apply `peer-eligibility.yaml` **before** weighted scoring.
3. Score with `peer-weights.yaml`; reweight among available factors only.
4. Store directed edges (`target_company_id` → `peer_company_id`).
5. Emit plain-English explanations from structured components.

## Validation layers

1. Config-time (taxonomy acyclicity, weight sums, eligibility node refs)
2. Fixture-time (IDs, qualities, coverage)
3. Contract-time (JSON Schema on exports)
4. Application-time (one primary, score bounds, evidence/manual rule)

## Out of scope

- Website / React UI / public API
- SEC filing ingestion and scrapers
- LLM / embeddings extraction
- Live prices or full S&P 500 classification
